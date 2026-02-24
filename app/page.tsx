'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  VscTerminalBash,
  VscPlay,
  VscCheck,
  VscError,
  VscFile,
  VscCloudDownload,
  VscFolder,
  VscRefresh,
  VscCircleFilled,
  VscArchive,
} from 'react-icons/vsc'

const DEFAULT_URL =
  'https://gist.githubusercontent.com/pradipta-lyzr/d4b49d8869a1a3b496a899e0bc4cb3c9/raw/54e55d0b9d1dc90ebc3b4c0fa0877ee4f018e0e8/system_health_monitor.sh'

interface ArtifactItem {
  filename: string
  size: string
  modified: string
  type?: string
  download_url?: string
  children?: ArtifactItem[]
}

interface ExecutionResult {
  status: string
  exit_code: number
  timestamp: string
  artifact_count: number
  artifacts: ArtifactItem[]
  message: string
  run_id?: string
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function formatTimestamp(ts: string): string {
  if (!ts) return '--'
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return ts
  }
}

function getFileExtension(filename: string): string {
  if (!filename) return ''
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

class InlineErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-mono">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2 tracking-wider">SYSTEM ERROR</h2>
            <p className="text-muted-foreground mb-4 text-sm font-mono">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground font-mono text-sm tracking-wider border border-border"
            >
              RETRY
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function HeaderBar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VscTerminalBash className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold font-mono tracking-wider text-foreground">
            Blind Artifact Runner
          </h1>
        </div>
        <span className="text-xs font-mono tracking-wider text-muted-foreground hidden sm:block">
          Secure blind script execution
        </span>
      </div>
    </header>
  )
}

function CursorBlink() {
  return (
    <span
      className="inline-block w-2 h-4 bg-foreground ml-1 align-middle"
      style={{ animation: 'cursor-blink 1s step-end infinite' }}
    />
  )
}

function LoadingState() {
  return (
    <Card className="border border-border bg-card">
      <CardContent className="py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <VscTerminalBash className="w-5 h-5 text-primary animate-pulse" />
            <span className="font-mono text-sm tracking-wider text-foreground">
              Executing script...
            </span>
            <CursorBlink />
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1 bg-muted overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
          <p className="text-xs font-mono text-muted-foreground tracking-wider">
            Downloading, setting permissions, and running...
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusCard({ result }: { result: ExecutionResult }) {
  const isSuccess = result.status === 'Success'
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono tracking-wider text-foreground">
            EXECUTION RESULT
          </CardTitle>
          <Badge
            variant={isSuccess ? 'default' : 'destructive'}
            className="font-mono text-xs tracking-wider"
          >
            {isSuccess ? (
              <VscCheck className="w-3 h-3 mr-1" />
            ) : (
              <VscError className="w-3 h-3 mr-1" />
            )}
            {result.status || 'Unknown'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground tracking-wider">EXIT CODE</span>
            <span className={isSuccess ? 'text-foreground' : 'text-destructive'}>
              {result.exit_code ?? '--'}
            </span>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground tracking-wider">TIMESTAMP</span>
            <span className="text-foreground">{formatTimestamp(result.timestamp)}</span>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground tracking-wider">ARTIFACTS</span>
            <span className="text-foreground">{result.artifact_count ?? 0} file(s) generated</span>
          </div>
          {result.run_id && (
            <>
              <Separator className="bg-border" />
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground tracking-wider">RUN ID</span>
                <span className="text-foreground text-[10px]">{result.run_id}</span>
              </div>
            </>
          )}
          {result.message && (
            <>
              <Separator className="bg-border" />
              <p className="text-xs font-mono text-muted-foreground tracking-wider leading-relaxed pt-1">
                {result.message}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function ArtifactCard({ artifact }: { artifact: ArtifactItem }) {
  const ext = getFileExtension(artifact?.filename ?? '')
  const isDir = artifact?.type === 'directory'
  const children = Array.isArray(artifact?.children) ? artifact.children : []

  const handleDownload = useCallback(() => {
    if (artifact?.download_url) {
      triggerDownload(artifact.download_url, artifact.filename || 'artifact')
    }
  }, [artifact?.download_url, artifact?.filename])

  const handleChildDownload = useCallback((child: ArtifactItem) => {
    if (child?.download_url) {
      triggerDownload(child.download_url, child.filename || 'file')
    }
  }, [])

  return (
    <Card className="border border-border bg-card transition-colors duration-200 hover:bg-secondary">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {isDir ? (
              <VscArchive className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            ) : (
              <VscFile className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-mono text-foreground tracking-wider truncate">
                {artifact?.filename ?? 'unknown'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                {isDir ? (
                  <Badge variant="outline" className="text-[10px] font-mono tracking-wider px-1.5 py-0">
                    DIR
                  </Badge>
                ) : ext ? (
                  <Badge variant="outline" className="text-[10px] font-mono tracking-wider px-1.5 py-0">
                    .{ext}
                  </Badge>
                ) : null}
                <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                  {artifact?.size ?? '--'}
                </span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wider mt-1">
                {formatTimestamp(artifact?.modified ?? '')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleDownload}
            disabled={!artifact?.download_url}
            title={isDir ? 'Download entire directory as .tar.gz' : 'Download artifact'}
          >
            <VscCloudDownload className="w-4 h-4" />
          </Button>
        </div>

        {/* Show individual files inside directory */}
        {isDir && children.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border space-y-2">
            <p className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              Contents ({children.length} files)
            </p>
            {children.map((child, idx) => {
              const childExt = getFileExtension(child?.filename ?? '')
              return (
                <div
                  key={child?.filename ?? idx}
                  className="flex items-center justify-between gap-2 pl-2 py-1 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <VscFile className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono text-foreground tracking-wider truncate">
                      {child?.filename ?? 'unknown'}
                    </span>
                    {childExt && (
                      <Badge variant="outline" className="text-[9px] font-mono tracking-wider px-1 py-0">
                        .{childExt}
                      </Badge>
                    )}
                    <span className="text-[9px] font-mono text-muted-foreground tracking-wider flex-shrink-0">
                      {child?.size ?? ''}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
                    onClick={() => handleChildDownload(child)}
                    disabled={!child?.download_url}
                    title={`Download ${child?.filename}`}
                  >
                    <VscCloudDownload className="w-3 h-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ArtifactBrowser({ artifacts }: { artifacts: ArtifactItem[] }) {
  const safeArtifacts = Array.isArray(artifacts) ? artifacts : []

  if (safeArtifacts.length === 0) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <VscFolder className="w-8 h-8" />
            <p className="text-xs font-mono tracking-wider text-center">
              No artifacts generated by this execution.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <VscFolder className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-mono tracking-wider text-muted-foreground uppercase">
          Generated Artifacts ({safeArtifacts.length})
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {safeArtifacts.map((artifact, idx) => (
          <ArtifactCard key={artifact?.filename ?? idx} artifact={artifact} />
        ))}
      </div>
    </div>
  )
}

function ExecutionPipelineInfo({ isActive }: { isActive: boolean }) {
  return (
    <Card className="border border-border bg-card">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <VscCircleFilled
              className={`w-2 h-2 ${isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
            />
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              Blind Execution Pipeline
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground">
            {isActive ? 'EXECUTING' : 'IDLE'}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] font-mono tracking-wider text-muted-foreground">
          <span>curl</span>
          <span className="text-primary">-{'>'}</span>
          <span>chmod +x</span>
          <span className="text-primary">-{'>'}</span>
          <span>bash</span>
          <span className="text-primary">-{'>'}</span>
          <span>artifacts</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Page() {
  const [scriptUrl, setScriptUrl] = useState(DEFAULT_URL)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRunScript = useCallback(async () => {
    const trimmedUrl = scriptUrl.trim()

    if (!trimmedUrl) {
      setUrlError('URL is required')
      return
    }
    if (!isValidUrl(trimmedUrl)) {
      setUrlError('Invalid URL. Must start with http:// or https://')
      return
    }

    setUrlError(null)
    setIsLoading(true)
    setError(null)
    setExecutionResult(null)

    try {
      // Call our server-side execute API that actually downloads + runs the script
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      })

      const data = await response.json()

      if (data.success === false && !data.status) {
        // Hard error from the API
        setError(data.error || 'Execution pipeline failed')
        return
      }

      // Map the response to our ExecutionResult shape
      setExecutionResult({
        status: data.status || 'Unknown',
        exit_code: data.exit_code ?? -1,
        timestamp: data.timestamp || new Date().toISOString(),
        artifact_count: data.artifact_count ?? 0,
        artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
        message: data.message || '',
        run_id: data.run_id || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [scriptUrl])

  const handleReset = useCallback(() => {
    setScriptUrl(DEFAULT_URL)
    setUrlError(null)
    setExecutionResult(null)
    setError(null)
    setIsLoading(false)
  }, [])

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScriptUrl(e.target.value)
    setUrlError(null)
  }, [])

  return (
    <InlineErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-mono tracking-wider relative">
        {/* CRT scanline overlay */}
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          }}
        />

        <HeaderBar />

        <main className="pt-16 pb-8 px-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* URL Input Section */}
            <Card className="border border-border bg-card mt-2">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <VscTerminalBash className="w-4 h-4 text-primary" />
                    <span className="text-xs font-mono tracking-wider text-muted-foreground uppercase">
                      Script URL
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="Paste script URL here..."
                      value={scriptUrl}
                      onChange={handleUrlChange}
                      disabled={isLoading}
                      className="font-mono text-sm tracking-wider bg-input border-border text-foreground placeholder:text-muted-foreground flex-1"
                    />
                    <Button
                      onClick={handleRunScript}
                      disabled={isLoading || !scriptUrl.trim()}
                      className="font-mono text-xs tracking-wider gap-1.5 px-4"
                    >
                      {isLoading ? (
                        <>
                          <span
                            className="w-3 h-3 border border-primary-foreground border-t-transparent animate-spin"
                            style={{ borderRadius: '50%', display: 'inline-block' }}
                          />
                          RUN
                        </>
                      ) : (
                        <>
                          <VscPlay className="w-3 h-3" />
                          RUN
                        </>
                      )}
                    </Button>
                  </div>
                  {urlError && (
                    <p className="text-xs font-mono tracking-wider text-destructive">
                      {urlError}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Loading State */}
            {isLoading && <LoadingState />}

            {/* Error Display */}
            {error && !isLoading && (
              <Card className="border border-destructive bg-card">
                <CardContent className="py-4 px-4">
                  <div className="flex items-start gap-2">
                    <VscError className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-mono tracking-wider text-destructive leading-relaxed">
                      {error}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Execution Result + Artifacts */}
            {executionResult && !isLoading && (
              <>
                <StatusCard result={executionResult} />
                <ArtifactBrowser artifacts={executionResult.artifacts} />
              </>
            )}

            {/* Empty State */}
            {!executionResult && !isLoading && !error && (
              <Card className="border border-border bg-card">
                <CardContent className="py-8">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <VscFolder className="w-8 h-8" />
                    <p className="text-xs font-mono tracking-wider text-center leading-relaxed">
                      No artifacts yet -- run a script to generate files.
                    </p>
                    <p className="text-[10px] font-mono tracking-wider text-center">
                      Paste a script URL above and click RUN to begin.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Run Again Button */}
            {(executionResult || error) && !isLoading && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="font-mono text-xs tracking-wider gap-1.5 border-border text-foreground hover:bg-secondary"
                >
                  <VscRefresh className="w-3 h-3" />
                  RUN AGAIN
                </Button>
              </div>
            )}

            <Separator className="bg-border" />

            {/* Pipeline Status */}
            <ExecutionPipelineInfo isActive={isLoading} />
          </div>
        </main>
      </div>
    </InlineErrorBoundary>
  )
}
