'use client'

import React, { useState, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
} from 'react-icons/vsc'

const AGENT_ID = '699d920db4b231da1d17df9f'

const DEFAULT_URL =
  'https://gist.githubusercontent.com/pradipta-lyzr/d4b49d8869a1a3b496a899e0bc4cb3c9/raw/54e55d0b9d1dc90ebc3b4c0fa0877ee4f018e0e8/system_health_monitor.sh'

interface ArtifactItem {
  filename: string
  size: string
  modified: string
}

interface ExecutionResult {
  status: string
  exit_code: number
  timestamp: string
  artifact_count: number
  artifacts: ArtifactItem[]
  message: string
}

const SAMPLE_RESULT: ExecutionResult = {
  status: 'Success',
  exit_code: 0,
  timestamp: '2025-02-24T14:32:07Z',
  artifact_count: 4,
  artifacts: [
    { filename: 'system_report.log', size: '24.5 KB', modified: '2025-02-24T14:32:05Z' },
    { filename: 'cpu_metrics.csv', size: '8.1 KB', modified: '2025-02-24T14:32:06Z' },
    { filename: 'memory_snapshot.json', size: '3.2 KB', modified: '2025-02-24T14:32:06Z' },
    { filename: 'disk_usage_summary.txt', size: '1.7 KB', modified: '2025-02-24T14:32:07Z' },
  ],
  message: 'Script executed successfully. 4 artifact files generated in /artifacts/ directory.',
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
            <span className="text-foreground">{result.artifact_count ?? 0} files generated</span>
          </div>
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

function ArtifactCard({ artifact }: { artifact: ArtifactItem }) {
  const ext = getFileExtension(artifact?.filename ?? '')

  const handleDownload = useCallback(() => {
    alert(`Download not available in simulated mode.\nFile: ${artifact?.filename ?? 'unknown'}`)
  }, [artifact?.filename])

  return (
    <Card className="border border-border bg-card transition-colors duration-200 hover:bg-secondary">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <VscFile className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-mono text-foreground tracking-wider truncate">
                {artifact?.filename ?? 'unknown'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                {ext && (
                  <Badge variant="outline" className="text-[10px] font-mono tracking-wider px-1.5 py-0">
                    .{ext}
                  </Badge>
                )}
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
            title="Download artifact"
          >
            <VscCloudDownload className="w-4 h-4" />
          </Button>
        </div>
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
              No artifacts yet -- run a script to generate files.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {safeArtifacts.map((artifact, idx) => (
          <ArtifactCard key={artifact?.filename ?? idx} artifact={artifact} />
        ))}
      </div>
    </div>
  )
}

function AgentInfoPanel({ activeAgentId }: { activeAgentId: string | null }) {
  return (
    <Card className="border border-border bg-card">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <VscCircleFilled
              className={`w-2 h-2 ${activeAgentId ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
            />
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              Execution Orchestrator Agent
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground">
            {activeAgentId ? 'ACTIVE' : 'IDLE'}
          </span>
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
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [showSample, setShowSample] = useState(false)

  const displayResult = showSample ? SAMPLE_RESULT : executionResult

  const handleRunScript = useCallback(async () => {
    if (!scriptUrl.trim()) {
      setUrlError('URL is required')
      return
    }
    if (!isValidUrl(scriptUrl.trim())) {
      setUrlError('Invalid URL. Must start with http:// or https://')
      return
    }

    setUrlError(null)
    setIsLoading(true)
    setError(null)
    setExecutionResult(null)
    setActiveAgentId(AGENT_ID)

    try {
      const result = await callAIAgent(
        `Execute the script from this URL: ${scriptUrl.trim()}. Download it using curl, make it executable with chmod +x, execute it with bash directing output to /artifacts/ directory. Report only the execution status, exit code, and list of generated artifact files with their sizes and timestamps. Do NOT read or display the script contents or artifact contents.`,
        AGENT_ID
      )

      if (result.success && result?.response?.result) {
        const data = result.response.result
        setExecutionResult({
          status: data?.status || 'Unknown',
          exit_code: data?.exit_code ?? -1,
          timestamp: data?.timestamp || new Date().toISOString(),
          artifact_count: data?.artifact_count ?? 0,
          artifacts: Array.isArray(data?.artifacts) ? data.artifacts : [],
          message: data?.message || '',
        })
      } else {
        setError(result?.error || result?.response?.message || 'Execution failed. No valid response received.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error occurred')
    } finally {
      setIsLoading(false)
      setActiveAgentId(null)
    }
  }, [scriptUrl])

  const handleReset = useCallback(() => {
    setScriptUrl(DEFAULT_URL)
    setUrlError(null)
    setExecutionResult(null)
    setError(null)
    setIsLoading(false)
    setActiveAgentId(null)
  }, [])

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScriptUrl(e.target.value)
    setUrlError(null)
  }, [])

  return (
    <InlineErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-mono tracking-wider relative">
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          }}
        />

        <HeaderBar />

        <main className="pt-16 pb-8 px-4">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-end gap-2 pt-2">
              <Label htmlFor="sample-toggle" className="text-[10px] font-mono tracking-wider text-muted-foreground cursor-pointer">
                Sample Data
              </Label>
              <Switch
                id="sample-toggle"
                checked={showSample}
                onCheckedChange={setShowSample}
              />
            </div>

            <Card className="border border-border bg-card">
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
                          <span className="w-3 h-3 border border-primary-foreground border-t-transparent animate-spin" style={{ borderRadius: '50%', display: 'inline-block' }} />
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

            {isLoading && !showSample && <LoadingState />}

            {error && !showSample && (
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

            {displayResult && !isLoading && (
              <>
                <StatusCard result={displayResult} />
                <ArtifactBrowser artifacts={displayResult.artifacts} />
              </>
            )}

            {!displayResult && !isLoading && !error && (
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

            {(displayResult || error) && !isLoading && (
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

            <AgentInfoPanel activeAgentId={activeAgentId} />
          </div>
        </main>
      </div>
    </InlineErrorBoundary>
  )
}
