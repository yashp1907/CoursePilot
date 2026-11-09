import * as React from "react";

/** Minimal, safe renderer for assistant replies: paragraphs, bullets, numbered lists, **bold**. No raw HTML. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>));
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length} className={list.ordered ? "list-decimal pl-5 space-y-1" : "list-disc pl-5 space-y-1"}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[*-]\s+(.*)/); const num = line.match(/^\d+[.)]\s+(.*)/);
    if (bullet || num) { flushPara(); const ordered = !!num; if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push((bullet ?? num)![1]); }
    else if (!line) { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
