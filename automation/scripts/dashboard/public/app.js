const state = { activeTab: 'runs', expandedRunId: null }

function $(selector) { return document.querySelector(selector) }
function $all(selector) { return Array.from(document.querySelectorAll(selector)) }

async function api(path, options) {
  const res = await fetch(path, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

// ---------- Tabs ----------

function setupTabs() {
  $all('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab
      $all('.tab').forEach((b) => b.classList.toggle('active', b === btn))
      $all('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${btn.dataset.tab}`))
      loadActiveTab()
    })
  })
  $('#refresh').addEventListener('click', loadActiveTab)
}

function loadActiveTab() {
  if (state.activeTab === 'runs') return loadRuns()
  if (state.activeTab === 'healing') return loadHealing()
  if (state.activeTab === 'flaky') return loadFlaky()
}

// ---------- Runs ----------

async function loadRuns() {
  const container = $('#runs-table')
  try {
    const runs = await api('/api/runs')
    if (runs.length === 0) {
      container.innerHTML = '<p class="empty">No STLC runs yet. Run <code>npm run stlc:orchestrator</code> to create one.</p>'
      return
    }
    container.innerHTML = `
      <table>
        <thead><tr>
          <th>Run</th><th>Domain</th><th>Decision</th><th>Coverage</th><th>Test cases</th>
          <th>Human gates</th><th>Healing</th><th>Flaky</th><th>Updated</th>
        </tr></thead>
        <tbody>
          ${runs.map((r) => `
            <tr class="clickable" data-run-id="${escapeHtml(r.runId)}">
              <td>${escapeHtml(r.runId)}</td>
              <td>${escapeHtml(r.domain)}</td>
              <td><span class="badge ${escapeHtml(r.decision)}">${escapeHtml(r.decision)}</span></td>
              <td>${r.coveragePercent}%</td>
              <td>${r.testCaseCount}</td>
              <td>${r.pendingHumanGates > 0 ? `<span class="pill warn">${r.pendingHumanGates} pending</span>` : '<span class="pill">0</span>'}</td>
              <td>${r.pendingHealingProposals > 0 ? `<span class="pill warn">${r.pendingHealingProposals} pending</span>` : '<span class="pill">0</span>'}</td>
              <td>${r.flakyTestCount > 0 ? `<span class="pill warn">${r.flakyTestCount}</span>` : '<span class="pill">0</span>'}</td>
              <td>${fmtDate(r.updatedAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    $all('#runs-table tr[data-run-id]').forEach((row) => {
      row.addEventListener('click', () => showRunDetail(row.dataset.runId))
    })
  } catch (error) {
    container.innerHTML = `<p class="empty">Failed to load runs: ${escapeHtml(error.message)}</p>`
  }
}

async function showRunDetail(runId) {
  const detail = $('#run-detail')
  detail.classList.remove('hidden')
  detail.innerHTML = '<p class="empty">Loading report…</p>'
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/report`)
    const text = await res.text()
    detail.innerHTML = `
      <button class="detail-close" id="close-detail">✕ close</button>
      <h3>${escapeHtml(runId)} — quality-report.md</h3>
      <pre>${escapeHtml(text)}</pre>
    `
    $('#close-detail').addEventListener('click', () => detail.classList.add('hidden'))
  } catch (error) {
    detail.innerHTML = `<p class="empty">Failed to load report: ${escapeHtml(error.message)}</p>`
  }
}

// ---------- Healing ----------

async function loadHealing() {
  const container = $('#healing-list')
  const status = $('#healing-status').value
  container.innerHTML = '<p class="empty">Loading…</p>'
  try {
    const entries = await api(`/api/healing?status=${encodeURIComponent(status)}`)
    if (entries.length === 0) {
      container.innerHTML = '<p class="empty">No proposals with this status.</p>'
      return
    }
    container.innerHTML = entries.map(({ runId, proposal }) => `
      <div class="proposal" data-run-id="${escapeHtml(runId)}" data-proposal-id="${escapeHtml(proposal.id)}">
        <div class="proposal-header">
          <span class="proposal-id">${escapeHtml(proposal.id)}</span>
          <span class="proposal-conf">confidence ${Math.round(proposal.confidence * 100)}% · run ${escapeHtml(runId)}</span>
        </div>
        <div class="proposal-meta">POM: ${escapeHtml(proposal.pomFile)} · property <code>${escapeHtml(proposal.propertyOrMethod)}</code></div>
        <div class="selector-diff">
          <span class="selector-old">${escapeHtml(proposal.oldSelector)}</span> →
          <span class="selector-new">${escapeHtml(proposal.proposedSelector)}</span>
        </div>
        <div class="proposal-meta">${escapeHtml(proposal.reason)}</div>
        ${proposal.status === 'pending_human' ? `
          <div class="proposal-actions">
            <button class="btn approve" data-action="approve">✓ Approve &amp; apply</button>
            <button class="btn reject" data-action="reject">✕ Reject</button>
          </div>
        ` : `<span class="pill">${escapeHtml(proposal.status)}</span>`}
      </div>
    `).join('')

    $all('.proposal button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleHealingAction(btn))
    })
  } catch (error) {
    container.innerHTML = `<p class="empty">Failed to load proposals: ${escapeHtml(error.message)}</p>`
  }
}

async function handleHealingAction(btn) {
  const proposalCard = btn.closest('.proposal')
  const runId = proposalCard.dataset.runId
  const proposalId = proposalCard.dataset.proposalId
  const action = btn.dataset.action

  const label = action === 'approve' ? 'approve and apply' : 'reject'
  if (!window.confirm(`${label === 'reject' ? 'Reject' : 'Approve and write to disk for'} ${proposalId}?`)) return

  proposalCard.querySelectorAll('button').forEach((b) => (b.disabled = true))
  try {
    await api(`/api/healing/${encodeURIComponent(runId)}/${encodeURIComponent(proposalId)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await loadHealing()
  } catch (error) {
    window.alert(`Failed: ${error.message}`)
    proposalCard.querySelectorAll('button').forEach((b) => (b.disabled = false))
  }
}

// ---------- Flaky ----------

async function populateDomains() {
  try {
    const domains = await api('/api/domains')
    const select = $('#flaky-domain')
    const current = select.value
    select.innerHTML = '<option value="">All domains</option>' + domains.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')
    select.value = current
  } catch { /* best effort */ }
}

async function loadFlaky() {
  const container = $('#flaky-table')
  const domain = $('#flaky-domain').value
  const minScore = $('#flaky-min-score').value || '0.3'
  container.innerHTML = '<p class="empty">Loading…</p>'
  try {
    const params = new URLSearchParams({ minScore })
    if (domain) params.set('domain', domain)
    const entries = await api(`/api/flaky?${params.toString()}`)
    if (entries.length === 0) {
      container.innerHTML = '<p class="empty">No flaky tests above this threshold. 🎉</p>'
      return
    }
    container.innerHTML = `
      <table>
        <thead><tr><th>Case</th><th>Domain</th><th>Flaky score</th><th>Samples</th><th>Recent</th><th>Recommendation</th></tr></thead>
        <tbody>
          ${entries.map((e) => `
            <tr>
              <td>${escapeHtml(e.caseId)}</td>
              <td>${escapeHtml(e.domain)}</td>
              <td>
                <span class="score-bar"><span class="score-bar-fill ${e.flakyScore >= 0.5 ? 'high' : ''}" style="width:${Math.round(e.flakyScore * 100)}%"></span></span>
                ${e.flakyScore.toFixed(2)}
              </td>
              <td>${e.sampleSize}</td>
              <td>${e.lastStatuses.map((s) => (s === 'passed' ? '🟢' : s === 'failed' ? '🔴' : '⚪')).join(' ')}</td>
              <td><span class="pill ${e.recommendation === 'quarantine_candidate' ? 'warn' : ''}">${escapeHtml(e.recommendation)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } catch (error) {
    container.innerHTML = `<p class="empty">Failed to load flaky report: ${escapeHtml(error.message)}</p>`
  }
}

// ---------- Test impact ----------

function setupImpact() {
  $('#impact-run').addEventListener('click', async () => {
    const raw = $('#impact-files').value
    const changedFiles = raw.split('\n').map((line) => line.trim()).filter(Boolean)
    const resultEl = $('#impact-result')
    if (changedFiles.length === 0) {
      resultEl.innerHTML = '<p class="empty">Paste at least one file path first.</p>'
      return
    }
    resultEl.innerHTML = '<p class="empty">Analyzing…</p>'
    try {
      const result = await api('/api/impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changedFiles }),
      })
      resultEl.innerHTML = `
        ${result.runFullSuite ? '<p><span class="pill warn">Full suite recommended</span></p>' : ''}
        <p>${result.affectedDomains.length > 0
          ? result.affectedDomains.map((d) => `<span class="domain-chip">${escapeHtml(d)}</span>`).join('')
          : '<span class="empty">No domains matched</span>'}</p>
        <ul>${result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
        ${result.unmatchedFiles.length > 0 ? `<p class="empty">Unmatched: ${result.unmatchedFiles.map(escapeHtml).join(', ')}</p>` : ''}
      `
    } catch (error) {
      resultEl.innerHTML = `<p class="empty">Failed: ${escapeHtml(error.message)}</p>`
    }
  })
}

// ---------- Init ----------

setupTabs()
setupImpact()
$('#healing-status').addEventListener('change', loadHealing)
$('#flaky-domain').addEventListener('change', loadFlaky)
$('#flaky-min-score').addEventListener('change', loadFlaky)
populateDomains()
loadRuns()
