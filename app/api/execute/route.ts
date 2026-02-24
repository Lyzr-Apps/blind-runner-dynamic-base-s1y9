import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

// Persistent artifacts directory outside of tmp so Next.js can serve them
const ARTIFACTS_BASE = path.join(process.cwd(), '.artifacts')

/**
 * POST /api/execute
 *
 * Blind execution pipeline:
 *   1. Download script from the provided URL via curl
 *   2. chmod +x
 *   3. Run it in an isolated working directory
 *   4. Scan the working directory for any generated files (e.g. env_debug_*)
 *   5. Copy generated files to a persistent artifacts directory
 *   6. Return execution metadata (exit code, file listing) -- never file contents
 */
export async function POST(request: NextRequest) {
  let workDir = ''

  try {
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'url is required' },
        { status: 400 }
      )
    }

    // Basic URL validation
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json(
          { success: false, error: 'URL must use http or https protocol' },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Create a unique working directory for this execution
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    workDir = path.join('/tmp', runId)
    fs.mkdirSync(workDir, { recursive: true })

    // Derive script filename from URL
    const urlPath = new URL(url).pathname
    const rawName = path.basename(urlPath) || 'script.sh'
    // Sanitize: only allow alphanumeric, dash, underscore, dot
    const scriptName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const scriptPath = path.join(workDir, scriptName)

    // Step 1: Download the script (blind -- we never read its contents)
    try {
      await execAsync(
        `curl -fsSL -o "${scriptPath}" --max-time 30 "${url}"`,
        { timeout: 35000 }
      )
    } catch (dlError: any) {
      return NextResponse.json({
        success: true,
        status: 'Failed',
        exit_code: 1,
        timestamp: new Date().toISOString(),
        artifact_count: 0,
        artifacts: [],
        message: `Download failed: ${dlError?.stderr || dlError?.message || 'Could not fetch script from URL'}`,
        run_id: runId,
      })
    }

    // Step 2: Make executable
    fs.chmodSync(scriptPath, '755')

    // Step 3: Execute the script in its working directory
    // The script runs with workDir as cwd so any files it generates land there
    let exitCode = 0
    let execError = ''
    try {
      await execAsync(`bash "${scriptPath}"`, {
        cwd: workDir,
        timeout: 60000,
        env: {
          ...process.env,
          HOME: workDir,
          OUTPUT_DIR: workDir,
        },
      })
    } catch (runErr: any) {
      // Script returned non-zero -- that's okay, we still capture artifacts
      exitCode = runErr?.code ?? 1
      execError = runErr?.stderr
        ? runErr.stderr.slice(0, 200)
        : (runErr?.message || 'Script exited with error')
    }

    // Step 4: Scan for generated files (exclude the script itself)
    const allFiles = fs.readdirSync(workDir)
    const generatedFiles = allFiles.filter((f) => f !== scriptName)

    // Step 5: Copy generated files to persistent artifacts directory
    const artifactDir = path.join(ARTIFACTS_BASE, runId)
    fs.mkdirSync(artifactDir, { recursive: true })

    const artifacts: any[] = []

    for (const filename of generatedFiles) {
      const src = path.join(workDir, filename)
      const dest = path.join(artifactDir, filename)

      try {
        const stat = fs.statSync(src)
        if (stat.isDirectory()) {
          // Copy directory recursively
          copyDirSync(src, dest)
          const dirSize = getDirSize(dest)

          // List files inside the directory so the UI can show them individually
          const children: any[] = []
          try {
            const dirEntries = fs.readdirSync(dest)
            for (const child of dirEntries) {
              const childPath = path.join(dest, child)
              const childStat = fs.statSync(childPath)
              if (childStat.isFile()) {
                children.push({
                  filename: child,
                  size: formatBytes(childStat.size),
                  modified: childStat.mtime.toISOString(),
                  type: 'file',
                  download_url: `/api/artifacts/${runId}/${encodeURIComponent(filename)}/${encodeURIComponent(child)}`,
                })
              }
            }
          } catch {
            // if we can't list dir contents, just provide the tar download
          }

          artifacts.push({
            filename,
            size: formatBytes(dirSize),
            modified: stat.mtime.toISOString(),
            type: 'directory',
            download_url: `/api/artifacts/${runId}/${encodeURIComponent(filename)}`,
            children,
          })
        } else {
          fs.copyFileSync(src, dest)
          artifacts.push({
            filename,
            size: formatBytes(stat.size),
            modified: stat.mtime.toISOString(),
            type: 'file',
            download_url: `/api/artifacts/${runId}/${encodeURIComponent(filename)}`,
          })
        }
      } catch {
        artifacts.push({
          filename,
          size: '0 B',
          modified: new Date().toISOString(),
          type: 'file',
          download_url: `/api/artifacts/${runId}/${encodeURIComponent(filename)}`,
        })
      }
    }

    // Step 6: Return metadata only (blind -- no file contents)
    const isSuccess = exitCode === 0
    return NextResponse.json({
      success: true,
      status: isSuccess ? 'Success' : 'Failed',
      exit_code: exitCode,
      timestamp: new Date().toISOString(),
      artifact_count: artifacts.length,
      artifacts,
      message: isSuccess
        ? `Script executed successfully. ${artifacts.length} artifact(s) generated.`
        : `Script exited with code ${exitCode}. ${artifacts.length} artifact(s) found. ${execError}`,
      run_id: runId,
    })
  } catch (error: any) {
    // Return 200 with error details in body -- fetchWrapper swallows 500 responses
    return NextResponse.json({
      success: false,
      status: 'Failed',
      exit_code: -1,
      timestamp: new Date().toISOString(),
      artifact_count: 0,
      artifacts: [],
      message: error?.message || 'Internal server error during execution',
      error: error?.message || 'Internal server error',
    })
  } finally {
    // Cleanup: remove the temp working directory (artifacts are already copied)
    if (workDir) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true })
      } catch {
        // best effort cleanup
      }
    }
  }
}

// ── Helpers ──

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function getDirSize(dir: string): number {
  let size = 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        size += getDirSize(fullPath)
      } else {
        size += fs.statSync(fullPath).size
      }
    }
  } catch {
    // ignore
  }
  return size
}
