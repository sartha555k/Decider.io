import { openDatabase, listEntities } from "../lib/database";
import { scope, seller, company, contact, seedPrimaryScenario } from "../lib/fixtures";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default function Home() {
  const db = openDatabase();
  let facts, evidence, messages, outreach;
  try {
    seedPrimaryScenario(db);
    facts=listEntities(db,"facts",scope.sellerId,scope.companyId);
    evidence=listEntities(db,"evidence",scope.sellerId,scope.companyId);
    messages=listEntities(db,"messages",scope.sellerId,scope.companyId);
    outreach=listEntities(db,"outreach",scope.sellerId,scope.companyId);
  } finally { db.close(); }
  return <main>
    <header><a href="/" className="brand">B<span>Buyer Correction Tracker</span></a><span className="badge">Practice workspace</span></header>
    <section className="intro"><p className="eyebrow">REPLY REVIEW · FICTIONAL EXAMPLE</p><h1>A new reply.<br/>A clearer picture.</h1><p>See what a prospect corrected and which future messages need attention.</p></section>
    <aside>Foundation preview. Evaluation and approval controls follow in separate feature PRs. No emails are sent and no external systems are updated.</aside>
    <div className="grid">
      <section className="card"><p className="eyebrow">01 · CONTEXT</p><h2>Who’s talking?</h2><p className="label">Seller</p><h3>{seller.name} (fictional)</h3><p>{seller.productDescription}</p><p>Supports {seller.integrations.join(" and ")}.</p><hr/><p className="label">Prospect company & contact</p><h3>{company.name} (fictional)</h3><p>{contact.name} · {contact.role}</p></section>
      <section className="card"><p className="eyebrow">02 · WHAT WE BELIEVED</p><h2>CRM: {String(facts[0].value)}</h2><p>{String(evidence[0].originalText)}</p><p className="muted">Fictional job posting · Published {String(evidence[0].publishedAt)} · Checked {String(evidence[0].checkedAt)}</p><span className="badge">Research inference · Company scope</span></section>
      <section className="card reply"><p className="eyebrow">03 · WHAT THE PROSPECT SAID</p><h2>From {contact.name}</h2><blockquote>{String(messages[1].body)}</blockquote><p className="muted">Buyer-reported information, with original evidence preserved.</p></section>
      <section className="card"><p className="eyebrow">04 · LOCAL OUTREACH QUEUE</p><h2>Each message has its own dependencies</h2>{outreach.map(message=><article key={message.id}><span className="badge">{String(message.status)}</span><p>{String(message.body)}</p><small>{(message.factIds as string[]).length?"Uses the Salesforce research fact":"No dependency on the CRM fact"}</small></article>)}</section>
    </div>
    <footer><h2>How this works</h2><p>The app supplies context. OpenAI judges the correction. You review the proposed changes. The app updates the local records.</p><p className="muted">Practice mode will use labelled simulations. Live mode is not configured. Proposed module for Rhycon; no integration or endorsement is claimed.</p></footer>
  </main>;
}
