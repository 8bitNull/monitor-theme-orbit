import manifest from "../../theme.json"

/** 页脚：站点链接行与版权行，整体居中。 */
export function Footer({ siteName, text, url }: { siteName: string; text?: string; url?: string }) {
  return (
    <footer className="footer relative z-10 py-6 backdrop-blur-sm">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="text-center text-xs text-secondary">
          {text ? (
            url ? <a href={url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-accent">{text}</a>
              : text
          ) : (
            <>基于 <a href="https://github.com/monitor-probe/monitor" target="_blank" rel="noopener noreferrer"
              className="transition-colors hover:text-accent">极简探针</a> 驱动</>
          )}
        </div>
        <div className="mt-3 text-center text-sm text-secondary">
          <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/" className="font-medium transition-colors hover:text-accent">{siteName || "Monitor"}</a>
            <a href="https://monitor-document.pages.dev/" target="_blank" rel="noopener noreferrer"
              className="font-medium transition-colors hover:text-accent">极简探针</a>
            <span className="cursor-pointer text-xs transition-colors hover:text-accent" title={`主题 ${manifest.version}`}>
              {manifest.version}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
