import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const ARTIFACTS_BASE = path.join(process.cwd(), '.artifacts')

/**
 * GET /api/artifacts?run_id=xxx&filename=yyy
 *
 * Serves a generated artifact file for download.
 * If the artifact is a directory, it tars+gzips it on the fly and sends as .tar.gz.
 * Never exposes file contents to the agent layer -- this is a direct pipe to the user.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('run_id')
    const filename = searchParams.get('filename')

    if (!runId || !filename) {
      return NextResponse.json(
        { error: 'run_id and filename query parameters are required' },
        { status: 400 }
      )
    }

    // Support subpath for files inside directories (e.g. env_debug_123/environment.log)
    const subpath = searchParams.get('subpath')

    // Sanitize to prevent path traversal
    const safeRunId = path.basename(runId)
    const safeFilename = path.basename(filename)
    const safeSubpath = subpath ? path.basename(subpath) : null

    const artifactPath = safeSubpath
      ? path.join(ARTIFACTS_BASE, safeRunId, safeFilename, safeSubpath)
      : path.join(ARTIFACTS_BASE, safeRunId, safeFilename)

    if (!fs.existsSync(artifactPath)) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 }
      )
    }

    const stat = fs.statSync(artifactPath)

    // If it's a directory, tar it up and send as .tar.gz
    if (stat.isDirectory()) {
      try {
        const tarName = `${safeFilename}.tar.gz`
        const tarPath = path.join(ARTIFACTS_BASE, safeRunId, tarName)

        await execAsync(
          `tar -czf "${tarPath}" -C "${path.join(ARTIFACTS_BASE, safeRunId)}" "${safeFilename}"`,
          { timeout: 30000 }
        )

        const tarBuffer = fs.readFileSync(tarPath)

        // Clean up the temporary tar
        try { fs.unlinkSync(tarPath) } catch { /* best effort */ }

        return new NextResponse(tarBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${tarName}"`,
            'Content-Length': tarBuffer.length.toString(),
          },
        })
      } catch (tarErr: any) {
        return NextResponse.json(
          { error: `Failed to archive directory: ${tarErr?.message || 'Unknown error'}` },
          { status: 500 }
        )
      }
    }

    // Regular file -- stream it as download
    const fileBuffer = fs.readFileSync(artifactPath)
    const downloadName = safeSubpath || safeFilename
    const ext = path.extname(downloadName).toLowerCase()

    // Determine content type
    const contentTypeMap: Record<string, string> = {
      '.txt': 'text/plain',
      '.log': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.sh': 'application/x-sh',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.zip': 'application/zip',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    }

    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to serve artifact' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/artifacts?list=true&run_id=xxx
 *
 * Lists all artifacts for a given run.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { run_id } = body

    if (!run_id) {
      return NextResponse.json(
        { error: 'run_id is required' },
        { status: 400 }
      )
    }

    const safeRunId = path.basename(run_id)
    const runDir = path.join(ARTIFACTS_BASE, safeRunId)

    if (!fs.existsSync(runDir)) {
      return NextResponse.json({ artifacts: [] })
    }

    const entries = fs.readdirSync(runDir, { withFileTypes: true })
    const artifacts = entries.map((entry) => {
      const fullPath = path.join(runDir, entry.name)
      const stat = fs.statSync(fullPath)
      return {
        filename: entry.name,
        size: formatBytes(stat.size),
        modified: stat.mtime.toISOString(),
        type: entry.isDirectory() ? 'directory' : 'file',
        download_url: `/api/artifacts?run_id=${safeRunId}&filename=${encodeURIComponent(entry.name)}`,
      }
    })

    return NextResponse.json({ artifacts })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list artifacts' },
      { status: 500 }
    )
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
