// Dữ liệu và quy tắc cho màn đăng nhập, đơn, key, phiếu xuất kho và User Setting của demo Console; không gọi API thật. Quy tắc phản chiếu apps/ting-api/worker.
(function (root) {
  const ERRORS = {
    INVALID_CREDENTIALS: 'Tài khoản hoặc mật khẩu không đúng. Kiểm tra bạn đang dùng đúng cổng đăng nhập.',
    INVALID_INPUT: 'Thông tin chưa hợp lệ.',
    CURRENT_PASSWORD_INVALID: 'Mật khẩu hiện tại không đúng.',
    PASSWORD_NOT_SET: 'Tài khoản này chưa có mật khẩu Ting. Tiếp tục đăng nhập bằng Google.',
    CONFLICT: 'Mã tài khoản đã được dùng. Chọn mã khác.',
    RATE_LIMITED: 'Tạo tài khoản quá nhiều lần từ mạng này. Vui lòng thử lại sau 1 giờ hoặc liên hệ Ting.',
    PRICE_NOT_CONFIGURED: 'Chưa có giá key. Liên hệ Ting để được báo giá.',
    ORDER_NOT_PAYABLE: 'Đơn đã được xử lý hoặc đã hủy. Nhấn Làm mới để xem trạng thái mới.',
    KEY_NOT_AVAILABLE: 'Key không còn khả dụng để gán. Nhấn Làm mới và thử lại.',
    REFUND_NOT_ALLOWED: 'Chỉ hoàn được key chưa kích hoạt và chưa nằm trong yêu cầu hoàn khác.',
    FORBIDDEN: 'Không có quyền thực hiện hành động này',
    ACCOUNT_DISABLED: 'Tài khoản đã bị khóa. Liên hệ Ting để được hỗ trợ.',
    LAST_SUPER_ADMIN: 'Không thể khóa Super Admin hoạt động cuối cùng.',
    NOT_FOUND: 'Không tìm thấy tài khoản.',
    COMPANY_NOT_CONFIGURED: 'Chưa có thông tin đơn vị bán. Nhập ở mục Thông tin đơn vị bán trước khi xuất phiếu.',
    DELIVERY_NOTE_EXISTS: 'Đơn này đã có phiếu xuất kho đang hiệu lực. Hủy phiếu cũ nếu cần xuất lại.',
    PROFILE_INCOMPLETE: 'Hoàn tất hồ sơ người mua (họ tên, mã số thuế, địa chỉ, số điện thoại) trong User Setting trước khi đặt mua.',
  }
  const PORTAL_OF = { SUPER_ADMIN: 'staff', ACCOUNTANT: 'staff', OPERATOR: 'staff', TECHNICIAN: 'user' }
  const MAX_REGISTRATIONS_PER_HOUR = 5

  function seed() {
    return {
      seq: 100, prices: { 1: null, 12: null }, registrations: 0, now: '2026-10-19T09:00:00.000Z',
      users: {
        admin: { id: 'admin', name: 'Quản trị Ting', role: 'SUPER_ADMIN', password: 'demo-admin' },
        'ke-toan': { id: 'ke-toan', name: 'Kế toán Ting', role: 'ACCOUNTANT', password: 'demo-ketoan' },
        operator: { id: 'operator', name: 'Vận hành Ting', role: 'OPERATOR', password: 'demo-operator' },
        'ktv-hcm': { id: 'ktv-hcm', name: 'KTV Hồ Chí Minh', role: 'TECHNICIAN', password: 'demo-ktv', taxCode: '0312345678', address: '12 Lê Lợi, Q1, TP.HCM', phone: '0900 111 222', contact: 'Zalo 0900 111 222' },
      },
      rooms: [
        { ting: 'TING-AAAA-BBBB-CCCC-DDDD', name: 'Cyber Bình Minh', user: 'ktv-hcm' },
        { ting: 'TING-1111-2222-3333-4444', name: 'Net Sao Mai', user: 'ktv-hcm' },
      ],
      orders: [], keys: [], refunds: [], company: null, notes: [],
    }
  }

  const fail = code => ({ ok: false, code, message: ERRORS[code] })
  const done = extra => ({ ok: true, ...extra })
  const id = (db, prefix) => `${prefix}-${++db.seq}`

  function login(db, portal, userId, password) {
    const user = db.users[userId]
    if (!user || user.password !== password || PORTAL_OF[user.role] !== portal) return fail('INVALID_CREDENTIALS')
    if (user.active === false) return fail('ACCOUNT_DISABLED')
    return done({ user })
  }

  // Mọi tài khoản tự đăng ký đều là đại lý; không còn lựa chọn loại tài khoản.
  function register(db, userId, name, password) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(userId) || userId.startsWith('g_') || !name.trim() || password.length < 12) return fail('INVALID_INPUT')
    if (db.registrations >= MAX_REGISTRATIONS_PER_HOUR) return fail('RATE_LIMITED')
    db.registrations++
    if (db.users[userId]) return fail('CONFLICT')
    db.users[userId] = { id: userId, name: name.trim(), role: 'TECHNICIAN', password }
    return done({ user: db.users[userId] })
  }

  // Giả lập Google: cùng sub luôn ra cùng tài khoản; không gộp theo email.
  function googleLogin(db, sub, name) {
    const userId = `g_${sub}`
    if (!db.users[userId]) {
      if (db.registrations >= MAX_REGISTRATIONS_PER_HOUR) return fail('RATE_LIMITED')
      db.registrations++
      db.users[userId] = { id: userId, name, role: 'TECHNICIAN', password: null }
    }
    return done({ user: db.users[userId] })
  }

  function setPrice(db, actor, oneMonthPrice, twelveMonthPrice) {
    if (actor.role !== 'SUPER_ADMIN') return fail('FORBIDDEN')
    const valid = price => Number.isInteger(price) && price >= 1 && price <= 100000000
    if (!valid(oneMonthPrice) || !valid(twelveMonthPrice)) return fail('INVALID_INPUT')
    db.prices = { 1: oneMonthPrice, 12: twelveMonthPrice }
    return done()
  }

  function createAdmin(db, actor, userId, name, password, role) {
    if (actor.role !== 'SUPER_ADMIN') return fail('FORBIDDEN')
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(userId) || !name.trim() || password.length < 12 || !['SUPER_ADMIN', 'ACCOUNTANT', 'OPERATOR'].includes(role)) return fail('INVALID_INPUT')
    if (db.users[userId]) return fail('CONFLICT')
    db.users[userId] = { id: userId, name: name.trim(), role, password, active: true }
    return done()
  }

  function setAdminActive(db, actor, userId, active) {
    if (actor.role !== 'SUPER_ADMIN') return fail('FORBIDDEN')
    const target = db.users[userId]
    if (!target || !['SUPER_ADMIN', 'ACCOUNTANT', 'OPERATOR'].includes(target.role)) return fail('NOT_FOUND')
    if (!active && userId === actor.id) return fail('FORBIDDEN')
    const others = Object.values(db.users).filter(user => user.role === 'SUPER_ADMIN' && user.active !== false && user.id !== userId)
    if (!active && target.role === 'SUPER_ADMIN' && !others.length) return fail('LAST_SUPER_ADMIN')
    target.active = active
    return done()
  }

  function setAdminPassword(db, actor, userId, password) {
    if (actor.role !== 'SUPER_ADMIN') return fail('FORBIDDEN')
    if (password.length < 12) return fail('INVALID_INPUT')
    const target = db.users[userId]
    if (!target || !['SUPER_ADMIN', 'ACCOUNTANT', 'OPERATOR'].includes(target.role)) return fail('NOT_FOUND')
    target.password = password
    return done()
  }

  function changePassword(db, actor, currentPassword, newPassword) {
    const target = actor && db.users[actor.id]
    if (!target || target.active === false || target.role !== actor.role || !PORTAL_OF[target.role]) return fail('INVALID_CREDENTIALS')
    if (typeof currentPassword !== 'string' || !currentPassword.length || currentPassword.length > 128 || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) return fail('INVALID_INPUT')
    if (!target.password) return fail('PASSWORD_NOT_SET')
    if (target.password !== currentPassword) return fail('CURRENT_PASSWORD_INVALID')
    target.password = newPassword
    return done()
  }

  const profileComplete = user => Boolean(user.name?.trim() && user.taxCode && user.address && user.phone)

  // Phản chiếu PUT /v1/user/profile: chủ tài khoản tự sửa, MST/địa chỉ/SĐT bắt buộc.
  function setProfile(db, actor, input) {
    if (actor.role !== 'TECHNICIAN' || !db.users[actor.id]) return fail('FORBIDDEN')
    const text = (value, max) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null
    const profile = { name: text(input.name, 120), taxCode: text(input.taxCode, 14), address: text(input.address, 255), phone: text(input.phone, 20), contact: text(input.contact, 255) || '' }
    if (!profile.name || !TAX.test(profile.taxCode || '') || !profile.address || !PHONE_RE.test(profile.phone || '') || String(input.contact || '').trim().length > 255) return fail('INVALID_INPUT')
    Object.assign(db.users[actor.id], profile)
    return done()
  }

  // Người mua lấy từ hồ sơ lúc đặt; sửa hồ sơ sau đó không đổi đơn.
  function createOrder(db, actor, quantity, months = 12, note = '') {
    if (actor.role !== 'TECHNICIAN') return fail('FORBIDDEN')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500 || ![1, 12].includes(months) || String(note).trim().length > 500) return fail('INVALID_INPUT')
    const price = db.prices[months]
    if (!price) return fail('PRICE_NOT_CONFIGURED')
    const user = db.users[actor.id]
    if (!user || !profileComplete(user)) return fail('PROFILE_INCOMPLETE')
    const buyer = { name: user.name, taxCode: user.taxCode, address: user.address, phone: user.phone, contact: user.contact || '' }
    const order = { id: id(db, 'ORD'), user: actor.id, quantity, months, unitPrice: price, total: quantity * price, status: 'PENDING', createdAt: db.now, buyer, note: String(note).trim() }
    db.orders.unshift(order)
    return done({ order })
  }

  function decideOrder(db, actor, orderId, decision) {
    if (actor.role !== 'ACCOUNTANT') return fail('FORBIDDEN')
    const order = db.orders.find(item => item.id === orderId)
    if (!order || order.status !== 'PENDING') return fail('ORDER_NOT_PAYABLE')
    if (decision === 'reject') { order.status = 'CANCELLED'; return done() }
    order.status = 'ISSUED'
    for (let index = 0; index < order.quantity; index++) {
      const n = ++db.seq
      db.keys.push({ id: `KEY-${n}`, order: order.id, user: order.user, months: order.months, text: `TUP-${String(n).padStart(8, '0')}-A1B2C3D4-E5F60718-92A3B4C5`, state: 'AVAILABLE', ting: null, activated: false })
    }
    return done({ issued: order.quantity })
  }

  function keyStatus(key) {
    return key.state === 'REFUNDED' ? 'REFUNDED' : key.activated ? 'ACTIVATED' : key.state
  }

  function assignKey(db, actor, keyId, tingId) {
    const key = db.keys.find(item => item.id === keyId && item.user === actor.id)
    const room = db.rooms.find(item => item.ting === tingId)
    if (!room || room.user !== actor.id) return fail('FORBIDDEN')
    if (!key || key.state !== 'AVAILABLE') return fail('KEY_NOT_AVAILABLE')
    key.state = 'ASSIGNED'
    key.ting = tingId
    return done()
  }

  // Demo only: Ting Update kích hoạt key trên phòng máy.
  function activateKey(db, keyId) {
    const key = db.keys.find(item => item.id === keyId)
    if (!key || key.state !== 'ASSIGNED' || key.activated) return fail('KEY_NOT_AVAILABLE')
    key.activated = true
    return done()
  }

  function requestRefund(db, actor, orderId, keyIds) {
    const ids = [...new Set(keyIds)]
    const pending = new Set(db.refunds.filter(item => item.status === 'PENDING').flatMap(item => item.keys))
    const eligible = ids.length > 0 && ids.every(keyId => {
      const key = db.keys.find(item => item.id === keyId)
      return key && key.user === actor.id && key.order === orderId && key.state !== 'REFUNDED' && !key.activated && !pending.has(keyId)
    })
    if (!eligible) return fail('REFUND_NOT_ALLOWED')
    const refund = { id: id(db, 'RF'), user: actor.id, order: orderId, keys: ids, status: 'PENDING', reason: null }
    db.refunds.unshift(refund)
    return done({ refund })
  }

  // Kiểm tra lại đúng lúc duyệt: có key đã kích hoạt thì cả yêu cầu bị từ chối tự động.
  function decideRefund(db, actor, refundId, decision) {
    if (actor.role !== 'ACCOUNTANT') return fail('FORBIDDEN')
    const refund = db.refunds.find(item => item.id === refundId && item.status === 'PENDING')
    if (!refund) return fail('ORDER_NOT_PAYABLE')
    if (decision === 'reject') { refund.status = 'REJECTED'; refund.reason = 'ACCOUNTANT_REJECTED'; return done({ status: 'REJECTED' }) }
    if (refund.keys.some(keyId => db.keys.find(item => item.id === keyId).activated)) {
      refund.status = 'REJECTED'
      refund.reason = 'KEY_ACTIVATED'
      return done({ status: 'REJECTED', reason: 'KEY_ACTIVATED' })
    }
    refund.status = 'APPROVED'
    for (const keyId of refund.keys) db.keys.find(item => item.id === keyId).state = 'REFUNDED'
    return done({ status: 'APPROVED' })
  }

  const TAX = /^(\d{10}|\d{12}|\d{13}|\d{10}-\d{3})$/
  const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  function triple(value, higher) {
    const h = Math.floor(value / 100), t = Math.floor((value % 100) / 10), u = value % 10, out = []
    if (h > 0 || (higher && (t > 0 || u > 0))) out.push(DIGITS[h] + ' trăm')
    if (t > 1) out.push(DIGITS[t] + ' mươi'); else if (t === 1) out.push('mười'); else if (u > 0 && (h > 0 || higher)) out.push('lẻ')
    if (u > 0) out.push(t > 1 && u === 1 ? 'mốt' : t > 0 && u === 5 ? 'lăm' : DIGITS[u])
    return out.join(' ')
  }
  function vndInWords(amount) {
    if (!Number.isInteger(amount) || amount < 0 || amount >= 1e12) return ''
    if (amount === 0) return 'Không đồng'
    const groups = []
    for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000)
    const scales = ['', 'nghìn', 'triệu', 'tỷ'], parts = []
    for (let index = groups.length - 1; index >= 0; index--) if (groups[index]) parts.push((triple(groups[index], index < groups.length - 1) + ' ' + scales[index]).trim())
    const text = parts.join(' ') + ' đồng chẵn'
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  function setCompany(db, actor, company) {
    if (!['SUPER_ADMIN', 'ACCOUNTANT'].includes(actor.role)) return fail('FORBIDDEN')
    if (!company.name?.trim() || !company.address?.trim() || !TAX.test(company.taxCode || '')) return fail('INVALID_INPUT')
    db.company = { ...company, name: company.name.trim(), address: company.address.trim() }
    return done()
  }

  // Phiếu xuất kho Mẫu 02-VT: chỉ Kế toán tạo/hủy, đơn đã cấp key, một phiếu hiệu lực mỗi đơn, số liên tục theo năm, giữ bản chụp đơn vị bán.
  function createNote(db, actor, orderId, input = {}) {
    if (actor.role !== 'ACCOUNTANT') return fail('FORBIDDEN')
    const order = db.orders.find(item => item.id === orderId)
    if (!order) return fail('NOT_FOUND')
    if (order.status !== 'ISSUED') return fail('ORDER_NOT_PAYABLE')
    if (!db.company) return fail('COMPANY_NOT_CONFIGURED')
    if (db.notes.some(note => note.order === orderId && note.status === 'ISSUED')) return fail('DELIVERY_NOTE_EXISTS')
    if (input.taxCode && !TAX.test(input.taxCode)) return fail('INVALID_INPUT')
    const year = Number(db.now.slice(0, 4)), seq = Math.max(0, ...db.notes.filter(note => note.year === year).map(note => note.seq)) + 1
    const buyer = order.buyer || {}
    const note = { id: id(db, 'PXK'), order: orderId, year, seq, no: 'PXK-' + year + '-' + String(seq).padStart(6, '0'), status: 'ISSUED',
      receiver: input.name || buyer.name || db.users[order.user].name, address: input.address || buyer.address || '', taxCode: input.taxCode || buyer.taxCode || '',
      phone: input.phone || buyer.phone || '', reason: input.reason || 'Xuất bán key bản quyền Ting Update', warehouse: input.warehouse || db.company.warehouse || 'Kho phần mềm',
      attachment: input.attachment || '', company: { ...db.company }, quantity: order.quantity, months: order.months, unitPrice: order.unitPrice, total: order.total, issuedAt: db.now, cancelReason: null }
    db.notes.unshift(note)
    return done({ note })
  }

  function cancelNote(db, actor, noteId, reason) {
    if (actor.role !== 'ACCOUNTANT') return fail('FORBIDDEN')
    const note = db.notes.find(item => item.id === noteId && item.status === 'ISSUED')
    if (!note || !reason?.trim()) return fail(note ? 'INVALID_INPUT' : 'NOT_FOUND')
    note.status = 'CANCELLED'
    note.cancelReason = reason.trim()
    return done()
  }

  // Kiểm tra tại chỗ theo từng ô (khóa dạng "form:ô"); phản chiếu quy tắc của Console thật. Trả về thông báo lỗi hoặc ''.
  const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/, PHONE_RE = /^[0-9+ ().-]{6,20}$/
  const need = (label, max) => v => !v.trim() ? label + ' không được để trống.' : v.trim().length > max ? label + ' tối đa ' + max + ' ký tự.' : ''
  const maxLen = (label, max) => v => v.trim().length > max ? label + ' tối đa ' + max + ' ký tự.' : ''
  const account = reserve => v => !v.trim() ? 'Mã tài khoản không được để trống.' : !ID_RE.test(v.trim()) ? 'Mã tài khoản chỉ gồm chữ, số và các ký tự . _ - (tối đa 64 ký tự, không có dấu cách hay dấu tiếng Việt).' : reserve && v.trim().startsWith('g_') ? 'Mã tài khoản không được bắt đầu bằng g_ (dành cho tài khoản Google).' : ''
  const pass = v => v.length < 12 || v.length > 128 ? 'Mật khẩu phải từ 12 đến 128 ký tự.' : ''
  const phoneRule = v => !v.trim() || PHONE_RE.test(v.trim()) ? '' : 'Số điện thoại chỉ gồm số và các ký tự + ( ) . - (6 đến 20 ký tự).'
  const TAX_MSG = 'Mã số thuế gồm 10 số, 13 số, 10 số-3 số (chi nhánh) hoặc 12 số (CCCD của cá nhân).'
  const taxRule = required => v => !v.trim() ? (required ? 'Mã số thuế không được để trống.' : '') : TAX.test(v.trim()) ? '' : TAX_MSG
  const intRule = (label, min, max) => v => { const t = v.trim(); if (!t) return label + ' không được để trống.'; const n = Number(t); return !Number.isInteger(n) ? label + ' phải là số nguyên.' : n < min || n > max ? label + ' phải từ ' + min.toLocaleString('vi-VN') + ' đến ' + max.toLocaleString('vi-VN') + '.' : '' }
  const RULES = {
    'login:id': need('Mã tài khoản', 64), 'login:password': need('Mật khẩu', 128),
    'register:name': need('Tên hiển thị', 120), 'register:id': account(true), 'register:password': pass, 'register:confirm': (v, values) => v === values.password ? '' : 'Mật khẩu nhập lại không khớp.',
    'password:current_password': v => !v.length ? 'Mật khẩu hiện tại không được để trống.' : v.length > 128 ? 'Mật khẩu hiện tại tối đa 128 ký tự.' : '',
    'password:new_password': pass, 'password:confirm_password': (v, values) => v === values.new_password ? '' : 'Mật khẩu nhập lại không khớp.',
    'order:q': intRule('Số key', 1, 500), 'order:note': maxLen('Ghi chú', 500),
    'profile:name': need('Họ tên / tên đại lý', 120), 'profile:tax': taxRule(true), 'profile:addr': need('Địa chỉ', 255),
    'profile:phone': v => !v.trim() ? 'Số điện thoại không được để trống.' : phoneRule(v), 'profile:contact': maxLen('Liên hệ khác', 255),
    'price:p1': intRule('Giá key 1 tháng', 1, 100000000), 'price:p12': intRule('Giá key 12 tháng', 1, 100000000),
    'admin:id': account(false), 'admin:name': need('Tên hiển thị', 120), 'admin:pw': pass,
    'company:name': need('Tên đơn vị bán', 200), 'company:tax': taxRule(true), 'company:addr': need('Địa chỉ', 255), 'company:phone': phoneRule, 'company:wh': maxLen('Kho xuất', 120), 'company:dir': maxLen('Giám đốc', 100), 'company:chief': maxLen('Kế toán trưởng', 100),
  }
  const validate = (kind, name, value, values = {}) => RULES[kind + ':' + name] ? RULES[kind + ':' + name](value, values) : ''
  const fieldsOf = kind => Object.keys(RULES).filter(key => key.startsWith(kind + ':')).map(key => key.slice(kind.length + 1))

  // index.html chỉ dùng các helper dưới đây: gate test-no-raw-ui-error-codes chặn mã role/lỗi dạng A_B trong markup demo.
  const ACTOR_OF = { SUPER_ADMIN: 'admin', ACCOUNTANT: 'accountant', OPERATOR: 'operator', TECHNICIAN: 'ktv' }
  const DEFAULT_USER = { admin: 'admin', accountant: 'ke-toan', operator: 'operator', ktv: 'ktv-hcm' }
  const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ACCOUNTANT: 'Kế toán', OPERATOR: 'Vận hành hệ thống', TECHNICIAN: 'Kỹ thuật viên' }
  const consoleActor = user => ACTOR_OF[user?.role] || ''
  const defaultUser = actor => DEFAULT_USER[actor] || ''
  const roleLabel = user => user.userType === 'AGENT' ? 'Đại lý' : ROLE_LABEL[user.role]
  const adminRoles = [['ACCOUNTANT', 'Kế toán'], ['OPERATOR', 'Vận hành hệ thống'], ['SUPER_ADMIN', 'Super Admin']]
  const staffUsers = db => Object.values(db.users).filter(user => user.role !== 'TECHNICIAN')
  const technicianUsers = db => Object.values(db.users).filter(user => user.role === 'TECHNICIAN')
  const canReview = user => user.role === 'ACCOUNTANT'
  const refundLabel = refund => refund.status === 'PENDING' ? 'Chờ duyệt' : refund.status === 'APPROVED' ? 'Đã hoàn' : refund.reason === 'KEY_ACTIVATED' ? 'Từ chối: key đã kích hoạt' : 'Từ chối'
  const refundNotice = result => result.reason === 'KEY_ACTIVATED' ? 'Có key đã được kích hoạt trong lúc chờ duyệt nên yêu cầu bị từ chối tự động.' : ''

  const api = { validate, fieldsOf, changePassword, setCompany, createNote, cancelNote, vndInWords, seed, login, register, googleLogin, setPrice, createAdmin, setAdminActive, setAdminPassword, createOrder, decideOrder, assignKey, activateKey,
    requestRefund, decideRefund, keyStatus, PORTAL_OF, ERRORS, consoleActor, defaultUser, roleLabel, adminRoles, staffUsers, technicianUsers, canReview, refundLabel, refundNotice, setProfile, profileComplete }
  if (typeof module !== 'undefined') module.exports = api
  else root.UserDemo = api
})(typeof window !== 'undefined' ? window : globalThis)
