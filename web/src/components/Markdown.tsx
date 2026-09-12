import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { NoteSummary } from '../lib/api';
import { resolveLink, rewriteWikiLinks, stripFrontMatter, stripLeadingH1 } from '../lib/links';
import { Mermaid } from './Mermaid';
import { useT } from '../i18n';
import { rewriteCitations, useBib } from '../lib/cite';
import { noteUrl } from '../lib/noteUrl';

// Renders Markdown; [[wiki-link]] resolves to in-app navigation, unresolved targets are dimmed with a "not created yet" hint.
const NOTE_PATH = /^(raw|wiki|schema)\/[^\s`]+\.md$/;

// compact: tighter font size and line height for narrow columns such as the chat panel.
export function Markdown({ source, notes, onOpen, hideTitle, compact }: { source: string; notes: NoteSummary[]; onOpen: (path: string) => void; hideTitle?: boolean; compact?: boolean }) {
  const { t } = useT();
  const bib = useBib();
  return (
    <div className={`note-body ${compact ? 'note-body-compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={u => (u.startsWith('wiki:') || u.startsWith('cite-missing:') ? u : defaultUrlTransform(u))}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('wiki:')) {
              let target = href.slice(5);
              try { target = decodeURIComponent(target); } catch { /* malformed percent-encoding: use as-is */ }
              const hit = resolveLink(target, notes);
              return hit
                ? <a href={noteUrl(hit.path)} className="wl" onClick={e => { e.preventDefault(); onOpen(hit.path); }}>{children}</a>
                : <span className="wl-missing" title={t('markdown.missing', { target })} data-missing-link={target}>{children}</span>;
            }
            if (href?.startsWith('cite-missing:')) {
              let key = href.slice(13); try { key = decodeURIComponent(key); } catch { /* use as-is */ }
              return <span className="wl-missing" title={t('cite.missing', { key })} data-missing-cite={key}>{children}</span>;
            }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
          /* Never request an image from somewhere else. The page may have been written by an agent that had just read
             the whole workspace, and the URL is the agent's to choose, so fetching it would hand the contents to
             whoever owns that host. Imported images live under /api/assets; anything else is shown, not loaded. */
          img: ({ src, alt }) => {
            const local = typeof src === 'string' && (src.startsWith('/') || src.startsWith('data:'));
            if (local) return <img src={src} alt={alt ?? ''} />;
            return (
              <span className="ext-img" title={typeof src === 'string' ? src : ''}>
                {t('markdown.extImage')}{alt ? `：${alt}` : ''}
              </span>
            );
          },
          pre: ({ children, ...rest }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const cls = (child as { props?: { className?: string } } | null)?.props?.className;
            return cls === 'language-mermaid' ? <>{children}</> : <pre {...rest}>{children}</pre>;
          },
          // Agents often cite pages as `wiki/xxx.md`: existing pages become clickable links.
          code: ({ className, children, ...rest }) => {
            const text = String(children);
            if (className === 'language-mermaid') return <Mermaid code={text.replace(/\n$/, '')} />;
            if (!className && NOTE_PATH.test(text.trim()) && notes.some(n => n.path === text.trim())) {
              return <a href={noteUrl(text.trim())} className="wl font-mono text-[0.88em]" onClick={e => { e.preventDefault(); onOpen(text.trim()); }}>{text.trim()}</a>;
            }
            return <code className={className} {...rest}>{children}</code>;
          },
        }}
      >
        {rewriteCitations(rewriteWikiLinks(hideTitle ? stripLeadingH1(source) : stripFrontMatter(source)), bib)}
      </ReactMarkdown>
    </div>
  );
}
