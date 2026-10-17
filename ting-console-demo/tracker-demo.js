// Browser-only fixture. No API or tracker requests.
(() => {
  const key = 'ting-tracker-management-demo-v1';
  const defaults = [{ kind: 'public', name: 'Public mẫu', url: 'udp://tracker.example.org:1337/announce', enabled: true }, { kind: 'private', name: 'Ting private mẫu', url: 'https://api.example.org/announce', enabled: true }];
  let saved; try { saved = JSON.parse(localStorage.getItem(key)) } catch {}
  saved = Array.isArray(saved) ? saved : defaults;
  let rows = structuredClone(saved), dirty = false, importing = false, notice = '', preview = [], pendingDelete = null, publicationFailed = false;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const button = (label, action, index = '', disabled = false) => `<button type="button" class="${action === 'save' || action === 'import-apply' ? 'primary' : 'secondary'}" data-tracker-action="${action}" data-index="${index}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  function urlFor(text, kind = 'public') {
    try {
      const u = new URL(text.trim());
      if (!['udp:', 'http:', 'https:'].includes(u.protocol) || !u.hostname || u.search || u.hash || u.username || u.password || (u.protocol === 'udp:' && !u.port) ||
          u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.startsWith('[') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) ||
          (kind === 'private' && (u.protocol !== 'https:' || u.pathname !== '/announce'))) return null;
      return u;
    } catch { return null }
  }
  function html() {
    return `<div class="card" id="tracker-management"><h2>Danh sách tracker</h2><p>Public tìm peer trước; private dự phòng có giới hạn request. Service nhận thay đổi qua CDN trong khoảng 30 phút.</p><p><strong>Demo dùng dữ liệu mô phỏng, không gửi API thật.</strong></p>
      <div class="row">${button('Làm mới', 'refresh')}${button('Lưu và cập nhật CDN', 'save', '', !dirty || importing)}${button('Mô phỏng lỗi xuất CDN', 'failure')}${publicationFailed ? button('Thử cập nhật CDN lại', 'retry', '', dirty) : ''}</div><p role="status">${esc(notice || 'CDN đã cập nhật · dữ liệu mẫu')}${dirty ? ' · Có thay đổi chưa lưu.' : ''}</p>
      ${['public', 'private'].map(kind => {
        const group = rows.map((row, index) => ({ row, index })).filter(item => item.row.kind === kind);
        return `<h3>${kind === 'public' ? 'Public tracker' : 'Private tracker'}</h3><div class="row">${button('Thêm tracker', 'add-' + kind, '', rows.length >= 64)}${kind === 'public' ? button('Import danh sách', 'import') : ''}</div>${kind === 'private' ? '<p>Chỉ dùng Ting API tương thích đăng ký và tìm peer theo batch. Tên miền /announce đơn thuần chưa chứng minh tương thích.</p>' : ''}
        <div style="overflow-x:auto"><table><thead><tr><th>Thứ tự</th><th>Tên</th><th>URL</th><th>Bật</th><th>Thao tác</th></tr></thead><tbody>${group.map(({ row, index }, order) => `<tr><td style="white-space:nowrap">${order + 1} ${button('↑', 'up', index, order === 0)} ${button('↓', 'down', index, order === group.length - 1)}</td><td><input aria-label="Tên tracker ${order + 1} ${kind}" data-tracker-field="name" data-index="${index}" maxlength="160" value="${esc(row.name)}" placeholder="Đặt tên sau"></td><td><input style="min-width:300px" aria-label="URL tracker ${order + 1} ${kind}" data-tracker-field="url" data-index="${index}" maxlength="512" value="${esc(row.url)}"></td><td><input type="checkbox" aria-label="Bật ${esc(row.name)}" data-tracker-field="enabled" data-index="${index}" ${row.enabled ? 'checked' : ''}></td><td>${button('Xóa', 'delete', index)}</td></tr>`).join('')}</tbody></table></div>`;
      }).join('')}
      ${pendingDelete !== null ? `<div role="alertdialog" aria-label="Xác nhận xóa tracker"><p>Xóa tracker ${esc(rows[pendingDelete]?.name || rows[pendingDelete]?.url)} khỏi bản nháp?</p>${button('Xác nhận xóa', 'delete-confirm')}${button('Hủy', 'delete-cancel')}</div>` : ''}
      ${importing ? `<div style="border:1px solid var(--line);padding:16px;border-radius:8px"><h3>Import public tracker</h3><p>Mỗi dòng một URL. Import vào bản nháp, chưa cập nhật CDN.</p><input type="file" accept=".txt,text/plain" aria-label="Chọn file text" id="tracker-import-file"><textarea aria-label="Danh sách URL tracker" rows="5" maxlength="65536" id="tracker-import-text"></textarea>${button('Xem trước', 'preview')}<div id="tracker-import-preview"></div>${button('Thêm dòng hợp lệ', 'import-apply', '', !preview.some(row => row.status === 'Hợp lệ'))}${button('Hủy import', 'import-cancel')}</div>` : ''}</div>`;
  }
  window.trackerManagementDemo = html;
  function render() { const el = document.querySelector('#tracker-management'); if (el) el.outerHTML = html() }
  document.addEventListener('input', e => {
    if (e.target.id === 'tracker-import-text') {
      preview = [];
      document.querySelector('#tracker-import-preview').textContent = '';
      document.querySelector('[data-tracker-action="import-apply"]').disabled = true;
      return;
    }
    const field = e.target.dataset.trackerField;
    if (!field) return;
    rows[Number(e.target.dataset.index)][field] = field === 'enabled' ? e.target.checked : e.target.value;
    dirty = true; pendingDelete = null;
    const save = document.querySelector('[data-tracker-action="save"]'); if (save) save.disabled = importing;
  });
  document.addEventListener('change', async e => {
    if (e.target.id !== 'tracker-import-file') return;
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 65536) { notice = 'File tối đa 64 KiB.'; render(); return }
    document.querySelector('#tracker-import-text').value = await file.text();
    preview = [];
    document.querySelector('#tracker-import-preview').textContent = '';
    document.querySelector('[data-tracker-action="import-apply"]').disabled = true;
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tracker-action]'); if (!b) return;
    const action = b.dataset.trackerAction, index = Number(b.dataset.index);
    if (action === 'preview') {
      const text = document.querySelector('#tracker-import-text').value;
      const seen = new Set(rows.map(row => urlFor(row.url, row.kind)?.href));
      let room = Math.min(8 - rows.filter(row => row.kind === 'public' && row.enabled).length, 64 - rows.length);
      preview = text.split(/\r?\n/).map((text, i) => ({ text: text.trim(), line: i + 1 })).filter(row => row.text).map(row => {
        const url = urlFor(row.text), status = !url ? 'URL không hợp lệ' : seen.has(url.href) ? 'Trùng — bỏ qua' : room <= 0 ? 'Vượt giới hạn — bỏ qua' : 'Hợp lệ';
        if (url) seen.add(url.href); if (status === 'Hợp lệ') room--;
        return { ...row, url, status };
      });
      document.querySelector('#tracker-import-preview').innerHTML = `<table><tbody>${preview.map(row => `<tr><td>${row.line}</td><td>${esc(row.text)}</td><td>${row.status}</td></tr>`).join('')}</tbody></table>`;
      document.querySelector('[data-tracker-action="import-apply"]').disabled = !preview.some(row => row.status === 'Hợp lệ'); return;
    }
    if (!['delete-confirm', 'delete-cancel', 'delete'].includes(action)) pendingDelete = null;
    if (action === 'retry') { publicationFailed = false; notice = 'CDN đã cập nhật · ' + new Date().toLocaleString() }
    if (action.startsWith('add-')) { rows.push({ kind: action.slice(4), name: '', url: '', enabled: false }); dirty = true }
    if (action === 'up' || action === 'down') {
      const group = rows.map((row, i) => row.kind === rows[index].kind ? i : -1).filter(i => i >= 0);
      const target = group[group.indexOf(index) + (action === 'up' ? -1 : 1)];
      if (target !== undefined) { [rows[index], rows[target]] = [rows[target], rows[index]]; dirty = true }
    }
    if (action === 'delete') pendingDelete = index;
    if (action === 'delete-confirm') { rows.splice(pendingDelete, 1); pendingDelete = null; dirty = true }
    if (action === 'delete-cancel') pendingDelete = null;
    if (action === 'import') { importing = true; preview = [] }
    if (action === 'import-cancel') importing = false;
    if (action === 'import-apply') { rows.push(...preview.filter(row => row.status === 'Hợp lệ').map(row => ({ kind: 'public', name: row.url.hostname, url: row.url.href, enabled: true }))); dirty = true; importing = false }
    if (action === 'refresh') {
      if (dirty && !confirm('Bỏ thay đổi chưa lưu và lấy lại danh sách?')) return;
      rows = structuredClone(saved); dirty = false; importing = false; pendingDelete = null;
    }
    if (action === 'failure') { publicationFailed = true; notice = 'Chưa xuất được CDN. Danh sách đã lưu được giữ để thử lại. (Mô phỏng)'; }
    if (action === 'save') {
      const urls = rows.map(row => urlFor(row.url, row.kind)?.href);
      const valid = rows.every(row => row.url.length <= 512 && row.name.trim().length <= 160) && urls.every(Boolean) && new Set(urls).size === urls.length && ['public', 'private'].every(kind => { const count = rows.filter(row => row.kind === kind && row.enabled).length; return count >= 1 && count <= 8 });
      if (!valid) { notice = 'Kiểm tra URL, URL trùng và từ 1 đến 8 tracker đang bật mỗi nhóm.'; render(); return }
      rows = rows.map((row, i) => ({ ...row, url: urls[i], name: row.name.trim() || new URL(urls[i]).hostname }));
      saved = structuredClone(rows); localStorage.setItem(key, JSON.stringify(saved)); dirty = false; publicationFailed = false; notice = 'CDN đã cập nhật · ' + new Date().toLocaleString();
    }
    render();
  });
})();
