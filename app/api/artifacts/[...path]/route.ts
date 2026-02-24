import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const ARTIFACTS_BASE = path.join(process.cwd(), '.artifacts')

/**
 * GET /api/artifacts/:run_id/:filename
 * GET /api/artifacts/:run_id/:dirname/:subfile
 *
 * Path-based download route. The proxy strips query parameters,
 * so we encode run_id, filename, and optional subpath as URL path segments.
 *
 * Examples:
 *   /api/artifacts/run_123/env_debug_456            -> tar.gz the directory
 *   /api/artifacts/run_123/env_debug_456/system.log -> serve the file
 *   /api/artifacts/run_123/somefile.txt              -> serve the file
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const segments = params.path

    if (!segments || segments.length < 2) {
      return NextResponse.json(
        { error: 'URL must include at least run_id and filename: /api/artifacts/:run_id/:filename' },
        { status: 400 }
      )
    }

    // Sanitize each segment to prevent path traversal
    const safeSegments = segments.map((s) => path.basename(decodeURIComponent(s)))
    const safeRunId = safeSegments[0]
    const safeFilename = safeSegments[1]
    const safeSubpath = safeSegments.length > 2 ? safeSegments[2] : null

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
        const tarPath = path.join(ARTIFACTS_BASE, safeRunId, `_tmp_${Date.now()}_${tarName}`)

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
          { error: `Failed to archive directory: ${tarErr?.message || 'Unknown error'}` }
        )
      }
    }

    // Regular file -- stream it as download
    const fileBuffer = fs.readFileSync(artifactPath)
    const downloadName = safeSubpath || safeFilename
    const ext = path.extname(downloadName).toLowerCase()

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
      { error: error?.message || 'Failed to serve artifact' }
    )
  }
}
