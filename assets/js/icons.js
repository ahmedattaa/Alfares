// =========================================================
// Icons — مجموعة أيقونات SVG موحدة لكل المشروع (بدون مكتبات خارجية)
// =========================================================

const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const icons = {
  home: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v7H3v-7z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 14.3c2.7.4 4.6 2.4 4.6 5.7"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" ${stroke}><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 15h6"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.8-1L15 3h-4l-.2 2.5a7.7 7.7 0 0 0-1.8 1l-2.4-1-2 3.5L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.5 2.4-1c.5.4 1.1.8 1.8 1L11 21h4l.2-2.5c.7-.2 1.3-.6 1.8-1l2.4 1 2-3.5z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${stroke}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${stroke}><path d="M20 6L9 17l-5-5"/></svg>`,
  x: `<svg viewBox="0 0 24 24" ${stroke}><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 9v4"/><circle cx="12" cy="16.5" r=".2" fill="currentColor"/><path d="M10.3 3.9L1.8 18a1.5 1.5 0 0 0 1.3 2.2h17.8a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 5v14M5 12h14"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" ${stroke}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
  money: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="9"/><path d="M9 15c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3-.9-3-2 1.3-2 3-2 3 .9 3 2"/></svg>`,
  info: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".2" fill="currentColor"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.3c1.8 0 3.2-1.4 3.2-3.2C20.5 6.6 16.7 3 12 3z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8" r="1.2" fill="currentColor"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.1 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3z"/></svg>`,
};
