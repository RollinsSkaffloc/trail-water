import { STALE_DAYS } from './config';
import { ageClass, fetchReports, submitReport, timeAgo, type Status, type WaterSource } from './water';

const sheet = document.getElementById('sheet') as HTMLElement;
const toastEl = document.getElementById('toast') as HTMLElement;
let toastTimer: number | undefined;

export function toast(msg: string, ms = 4000) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), ms);
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

const STATUS_LABEL: Record<Status, string> = {
  flowing: 'Flowing',
  trickling: 'Trickling',
  pooled: 'Standing pools',
  dry: 'Dry',
};
const KIND_LABEL = { spring: 'Spring', creek: 'Creek', other: 'Water source' };

const localNow = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export interface SheetContext {
  signedIn: boolean;
  onSignIn: () => void;
  onPosted: (sourceId: string) => void;
}

export function closeSheet() {
  sheet.hidden = true;
  sheet.innerHTML = '';
}

export async function openSheet(src: WaterSource, ctx: SheetContext) {
  const age = ageClass(src.latest_observed_at);
  let latest: string;
  if (!src.latest_status || !src.latest_observed_at) {
    latest = '<p class="latest">No reports yet. Treat this source as unknown.</p>';
  } else if (age === 'stale') {
    latest = `<p class="latest">Last report was ${esc(timeAgo(src.latest_observed_at))}: ${STATUS_LABEL[src.latest_status].toLowerCase()}.
      Reports older than ${STALE_DAYS} days are shown as unknown. Carry extra water.</p>`;
  } else {
    latest = `<p class="latest"><span class="chip" data-status="${src.latest_status}">${STATUS_LABEL[src.latest_status]}</span>
      reported ${esc(timeAgo(src.latest_observed_at))}</p>`;
  }

  const form = ctx.signedIn
    ? `<form id="report-form">
        <fieldset>
          <legend>What did you see?</legend>
          ${(Object.keys(STATUS_LABEL) as Status[])
            .map((s, i) => `<label class="opt"><input type="radio" name="status" value="${s}" ${i === 0 ? 'required' : ''}> ${STATUS_LABEL[s]}</label>`)
            .join('')}
        </fieldset>
        <label>Seen at <input type="datetime-local" name="observed" value="${localNow()}" max="${localNow()}" required></label>
        <label>Note <textarea name="note" maxlength="500" rows="2" placeholder="Flow rate, water clarity, access"></textarea></label>
        <button type="submit" class="primary">Post report</button>
      </form>`
    : '<button type="button" id="sheet-signin" class="primary">Sign in to post a report</button>';

  sheet.innerHTML = `
    <button class="close" type="button" aria-label="Close">×</button>
    <h2>${esc(src.name || KIND_LABEL[src.kind])}</h2>
    <p class="meta">${KIND_LABEL[src.kind]} at ${src.lat.toFixed(4)}, ${src.lng.toFixed(4)}</p>
    ${latest}
    <h3>Recent reports</h3>
    <ul id="reports"><li class="muted">Loading</li></ul>
    ${form}`;
  sheet.hidden = false;

  sheet.querySelector('.close')!.addEventListener('click', closeSheet);
  sheet.querySelector('#sheet-signin')?.addEventListener('click', ctx.onSignIn);

  sheet.querySelector<HTMLFormElement>('#report-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const observed = new Date(String(f.get('observed')));
    try {
      const result = await submitReport({
        source_id: src.id,
        status: f.get('status') as Status,
        note: String(f.get('note') || '').trim() || null,
        observed_at: new Date(Math.min(observed.getTime(), Date.now())).toISOString(),
      });
      toast(result === 'sent' ? 'Report posted.' : 'No signal. Report saved and will post when you are back online.');
      ctx.onPosted(src.id);
    } catch (err) {
      toast(`Could not post report: ${(err as Error).message}`);
    }
  });

  const reports = await fetchReports(src.id);
  const list = sheet.querySelector('#reports');
  if (!list) return;
  list.innerHTML = reports.length
    ? reports
        .map(
          (r) => `<li><span class="chip" data-status="${r.status}">${STATUS_LABEL[r.status]}</span>
            <span class="muted">${esc(timeAgo(r.observed_at))}</span>${r.note ? `<p>${esc(r.note)}</p>` : ''}</li>`,
        )
        .join('')
    : '<li class="muted">Nothing to show. Reports load when you are online.</li>';
}
