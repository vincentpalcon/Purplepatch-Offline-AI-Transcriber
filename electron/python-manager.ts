import { ChildProcess, execSync, spawn } from 'child_process'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BACKEND_PORT = 8742
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`
const SETTINGS_URL = `http://127.0.0.1:${BACKEND_PORT}/settings/`
// Generous: the backend now imports torch + pyannote.audio, and on a fresh
// Windows install Defender real-time scanning of ~1GB of newly-extracted
// DLLs/pyd files on first run can add well over a minute before the process
// is even ready to bind a socket.
const STARTUP_TIMEOUT_MS = 180_000
const POLL_INTERVAL_MS = 500
const LOG_TAIL_LINES = 60
const LOG_CONSOLE_LINES = 2000

type LogListener = (line: string) => void

export class PythonManager {
  private process: ChildProcess | null = null
  private logTail: string[] = []
  private logBuffer: string[] = []
  private logListeners = new Set<LogListener>()
  private exitCode: number | null = null
  private exited = false

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener)
    return () => {
      this.logListeners.delete(listener)
    }
  }

  getLogs(): string[] {
    return [...this.logBuffer]
  }

  clearLogs(): void {
    this.logBuffer = []
  }

  get port(): number {
    return BACKEND_PORT
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${BACKEND_PORT}`
  }

  private getBackendRoot(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'backend')
    }
    return join(app.getAppPath(), 'backend')
  }

  private getPythonExecutable(): string {
    const backendRoot = this.getBackendRoot()
    const isWindows = process.platform === 'win32'

    if (app.isPackaged) {
      const bundled = join(
        process.resourcesPath,
        'python',
        isWindows ? 'python.exe' : 'bin/python3'
      )
      if (existsSync(bundled)) return bundled
    }

    const venvPython = join(
      backendRoot,
      '.venv',
      isWindows ? 'Scripts/python.exe' : 'bin/python'
    )
    if (existsSync(venvPython)) return venvPython

    return isWindows ? 'python' : 'python3'
  }

  private freePort(): void {
    try {
      if (process.platform === 'win32') {
        const output = execSync(`netstat -ano | findstr :${BACKEND_PORT}`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        })
        const pids = new Set(
          output
            .split('\n')
            .map((line) => line.trim().split(/\s+/).pop())
            .filter((pid) => pid && /^\d+$/.test(pid))
        )
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          } catch {
            // Process may have already exited
          }
        }
        return
      }

      const pids = execSync(`lsof -ti :${BACKEND_PORT}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()

      if (!pids) return

      for (const pid of pids.split('\n')) {
        try {
          process.kill(Number(pid), 'SIGTERM')
        } catch {
          // Process may have already exited
        }
      }
    } catch {
      // Port is already free
    }
  }

  private appendLog(line: string): void {
    this.logTail.push(line)
    if (this.logTail.length > LOG_TAIL_LINES) this.logTail.shift()

    this.logBuffer.push(line)
    if (this.logBuffer.length > LOG_CONSOLE_LINES) {
      this.logBuffer.splice(0, this.logBuffer.length - LOG_CONSOLE_LINES)
    }

    for (const listener of this.logListeners) {
      listener(line)
    }
  }

  private writeLogFile(): void {
    try {
      const logDir = app.getPath('userData')
      mkdirSync(logDir, { recursive: true })
      writeFileSync(join(logDir, 'backend-startup.log'), this.logTail.join('\n'), 'utf8')
    } catch {
      // Best-effort diagnostics only; don't let a logging failure mask the real error.
    }
  }

  async start(): Promise<void> {
    if (this.process) return

    this.freePort()
    this.logTail = []
    this.logBuffer = []
    this.exitCode = null
    this.exited = false

    const backendRoot = this.getBackendRoot()
    const python = this.getPythonExecutable()
    this.appendLog(`$ ${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`)
    this.appendLog(`cwd: ${backendRoot}`)

    this.process = spawn(
      python,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          TRANSCRIBE_DATA_DIR: app.getPath('userData'),
          TRANSCRIBE_APP_MODE: app.isPackaged ? 'production' : 'development'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      console.log(`[backend] ${text}`)
      this.appendLog(text)
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      console.error(`[backend] ${text}`)
      this.appendLog(text)
    })

    this.process.on('error', (err) => {
      // e.g. the python executable itself couldn't be spawned (missing/corrupt bundle)
      this.appendLog(`Failed to spawn process: ${err.message}`)
      this.exited = true
      this.process = null
    })

    this.process.on('exit', (code) => {
      console.log(`[backend] exited with code ${code}`)
      this.appendLog(`process exited with code ${code}`)
      this.exitCode = code
      this.exited = true
      this.process = null
    })

    try {
      await this.waitForHealthy()
    } catch (err) {
      this.writeLogFile()
      throw err
    }
  }

  private async waitForHealthy(): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS

    while (Date.now() < deadline) {
      if (this.exited) {
        throw new Error(
          `Local transcription engine exited during startup (code ${this.exitCode}).\n\n` +
            this.logTail.slice(-20).join('\n')
        )
      }

      try {
        const [health, settings] = await Promise.all([
          fetch(HEALTH_URL),
          fetch(SETTINGS_URL)
        ])
        if (health.ok && settings.ok) return
      } catch {
        // Local engine still starting
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    throw new Error(
      'Local transcription engine failed to start within timeout.\n\n' +
        this.logTail.slice(-20).join('\n')
    )
  }

  stop(): void {
    if (!this.process) return

    const proc = this.process
    this.process = null

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'])
    } else {
      proc.kill('SIGTERM')
    }
  }
}