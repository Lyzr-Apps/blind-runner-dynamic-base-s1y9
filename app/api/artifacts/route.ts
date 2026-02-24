import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const ARTIFACTS_BASE = path.join(process.cwd(), '.artifacts')

/**
 * GET /api/artifacts (no path segments)
 *
 * Redirect hint -- actual downloads use /api/artifacts/:run_id/:filename
 */
export async function GET() {
  return NextResponse.json({
    error: 'Use path-based URLs for downloads: /api/artifacts/:run_id/:filename',
    example: '/api/artifacts/run_123/myfile.txt',
  })
}

/**
 * POST /api/artifacts
 *
 * Lists all artifacts for a given run. Used internally by the app.
 * Downloads are handled by /api/artifacts/[...path]/route.ts
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
        download_url: `/api/artifacts/${safeRunId}/${encodeURIComponent(entry.name)}`,
      }
    })

    return NextResponse.json({ artifacts })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list artifacts' }
    )
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
