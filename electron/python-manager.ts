import { ChildProcess, execSync, spawn } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

const BACKEND_PORT = 8742
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`
const SETTINGS_URL = `http://127.0.0.1:${BACKEND_PORT}/settings/`
const STARTUP_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 500

export class PythonManager {
  private process: ChildProcess | null = null

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

  async start(): Promise<void> {
    if (this.process) return

    this.freePort()

    const backendRoot = this.getBackendRoot()
    const python = this.getPythonExecutable()

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
      console.log(`[backend] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[backend] ${data.toString().trim()}`)
    })

    this.process.on('exit', (code) => {
      console.log(`[backend] exited with code ${code}`)
      this.process = null
    })

    await this.waitForHealthy()
  }

  private async waitForHealthy(): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS

    while (Date.now() < deadline) {
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

    throw new Error('Local transcription engine failed to start within timeout')
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