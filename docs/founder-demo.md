# A five-minute founder demonstration

1. Start the app and select **CRM switched to HubSpot** in Practice mode. Explain that Routewise is the fictional seller and Northstar Labs is the prospect. Maya’s reply concerns her organisation’s CRM, not the seller’s systems.
2. Open the research source. The Salesforce inference came from a dated job posting; it is not proof of current usage. Show the prospect’s reply and the local message history.
3. Click **Evaluate reply**. Point out the buyer-reported HubSpot proposal, the Salesforce-dependent queued follow-up, the unaffected general introduction, and the already-sent email that remains in history. Results are explicitly simulated.
4. Uncheck **HubSpot supported** and evaluate again. The rewrite disappears because seller capability matters. Reenable support and reevaluate; an appropriate draft suggestion returns. Editing inputs makes older proposals stale.
5. Approve the correction and pause while optionally declining the rewrite. Or approve all three to demonstrate the revised draft remaining paused. Show the original Salesforce record and evidence alongside the new buyer-reported fact, and inspect the audit event. No email has been sent.
6. Revert the internal repair. Explain that this creates a new audit event, preserves evidence, and is allowed only while the records have not changed. Record versions keep increasing. The application does not promise reversal of future external actions.
7. Try **Team-specific CRM correction**, **Multiple corrections**, and **Explicit opt-out**. Team statements preserve company-wide records; multiple corrections stay separate; an opt-out immediately cancels pending local outreach and does not produce another pitch.
8. Select **Live**. The connection status explains whether credentials are configured. Clicking Evaluate without configuration reports the missing prerequisite and never displays simulated results as live. Live mode uses only Decisions with GPT-6 Luna: it proposes exact buyer statements and pauses, with no generated drafts. When API credentials and reviewed Decisions pricing are supplied, run a small explicit live check before claiming model access works.

The closing question: “When a prospect corrects us, can we identify the affected facts and future messages, propose the right repair, and preserve an understandable history?”
