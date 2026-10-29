import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const K = createRequire(import.meta.url)('./portal-logic.js')
const fresh = () => {
  const db = K.seed()
  return { db, admin: db.users.admin, acct: db.users['ke-toan'], operator: db.users.operator, user: db.users['ktv-hcm'] }
}
const issued = (quantity = 2) => {
  const ctx = fresh()
  K.setPrice(ctx.db, ctx.admin, 70000, 400000)
  const { order } = K.createOrder(ctx.db, ctx.user, quantity)
  K.decideOrder(ctx.db, ctx.acct, order.id, 'approve')
  return { ...ctx, order }
}

for (const account of ['admin', 'ke-toan', 'operator', 'ktv-hcm', 'agent']) {
  test(`self password change preserves other accounts and login for ${account}`, () => {
    const { db } = fresh()
    K.register(db, 'agent', 'Đại lý mẫu', 'demo-agent-password', 'AGENT')
    const actor = { ...db.users[account] }, before = structuredClone(db.users)
    const password = '  new-password-123  '
    assert.equal(K.changePassword(db, actor, actor.password, password).ok, true)
    assert.equal(K.login(db, K.PORTAL_OF[actor.role], actor.id, actor.password).ok, false)
    assert.equal(K.login(db, K.PORTAL_OF[actor.role], actor.id, password).ok, true)
    before[account].password = password
    assert.deepEqual(db.users, before)
    assert.equal(K.changePassword(db, actor, actor.password, 'another-password').code, 'CURRENT_PASSWORD_INVALID')
    if (actor.role !== 'SUPER_ADMIN') assert.equal(K.setAdminPassword(db, actor, 'admin', 'unauthorized-pass').code, 'FORBIDDEN')
  })
}

test('self password change authenticates the active database actor before validating input', () => {
  const { db, user } = fresh()
  for (const actor of [null, { id: 'missing', role: 'SUPER_ADMIN' }, { ...user, role: 'SUPER_ADMIN' }]) {
    assert.equal(K.changePassword(db, actor, '', '').code, 'INVALID_CREDENTIALS')
  }
  user.active = false
  assert.equal(K.changePassword(db, user, '', '').code, 'INVALID_CREDENTIALS')
  assert.equal(user.password, 'demo-ktv')
})

test('self password change rejects wrong current passwords, invalid bounds and Google-only accounts', () => {
  const { db, user } = fresh()
  const before = structuredClone(db.users)
  assert.equal(K.changePassword(db, user, 'wrong', 'valid-password').code, 'CURRENT_PASSWORD_INVALID')
  for (const [current, password] of [['', 'valid-password'], ['x'.repeat(129), 'valid-password'], [null, 'valid-password'], ['demo-ktv', null], ['demo-ktv', 'x'.repeat(11)], ['demo-ktv', 'x'.repeat(129)]]) {
    assert.equal(K.changePassword(db, user, current, password).code, 'INVALID_INPUT')
  }
  assert.deepEqual(db.users, before)
  assert.equal(K.changePassword(db, user, 'demo-ktv', 'x'.repeat(12)).ok, true)
  assert.equal(K.changePassword(db, user, 'x'.repeat(12), '😀'.repeat(64)).ok, true)
  assert.equal(K.changePassword(db, user, '😀'.repeat(64), ' '.repeat(12)).ok, true)
  assert.equal(K.login(db, 'user', user.id, ' '.repeat(12)).ok, true)
  const google = K.googleLogin(db, 'fake-sub', 'Google mẫu').user
  assert.equal(K.changePassword(db, google, 'anything', 'valid-password').code, 'PASSWORD_NOT_SET')
  assert.equal(google.password, null)
  assert.equal(K.ERRORS.CURRENT_PASSWORD_INVALID.includes('CURRENT_PASSWORD_INVALID'), false)
  assert.equal(K.ERRORS.PASSWORD_NOT_SET.includes('PASSWORD_NOT_SET'), false)
})

test('settings inline validation checks confirmation and untrimmed password bounds', () => {
  assert.deepEqual(K.fieldsOf('password'), ['current_password', 'new_password', 'confirm_password'])
  for (const value of ['', 'x'.repeat(129)]) assert.notEqual(K.validate('password', 'current_password', value), '')
  for (const value of ['demo-ktv', ' '.repeat(128)]) assert.equal(K.validate('password', 'current_password', value), '')
  for (const value of ['x'.repeat(11), 'x'.repeat(129)]) assert.notEqual(K.validate('password', 'new_password', value), '')
  assert.equal(K.validate('password', 'new_password', ' '.repeat(12)), '')
  assert.notEqual(K.validate('password', 'confirm_password', 'different', { new_password: 'valid-password' }), '')
  assert.equal(K.validate('password', 'confirm_password', 'valid-password', { new_password: 'valid-password' }), '')
})

test('each portal rejects accounts of the other portal with the same message', () => {
  const { db } = fresh()
  assert.equal(K.login(db, 'user', 'ktv-hcm', 'demo-ktv').ok, true)
  assert.equal(K.login(db, 'staff', 'ke-toan', 'demo-ketoan').ok, true)
  assert.equal(K.login(db, 'staff', 'operator', 'demo-operator').ok, true)
  assert.equal(K.login(db, 'staff', 'ktv-hcm', 'demo-ktv').message, K.ERRORS.INVALID_CREDENTIALS)
  assert.equal(K.login(db, 'user', 'admin', 'demo-admin').message, K.ERRORS.INVALID_CREDENTIALS)
})

test('self registration makes a technician, is rate limited, google links by sub', () => {
  const { db } = fresh()
  const reg = K.register(db, 'daily-1', 'Đại lý 1', 'a-long-password-1')
  assert.equal(reg.user.role, 'TECHNICIAN')
  assert.equal('userType' in K.register(db, 'agent-9', 'Đại lý 9', 'a-long-password-1').user, false, 'không còn chọn loại tài khoản')
  assert.equal(K.register(db, 'g_5', 'x', 'a-long-password-1').ok, false)
  assert.equal(K.register(db, 'daily-1', 'x', 'a-long-password-1').code, 'CONFLICT')
  assert.equal(K.googleLogin(db, '1001', 'G').user.id, K.googleLogin(db, '1001', 'G').user.id)
  while (db.registrations < 5) K.register(db, `u${db.registrations}`, 'u', 'a-long-password-1')
  assert.equal(K.register(db, 'late', 'x', 'a-long-password-1').code, 'RATE_LIMITED')
  assert.equal(K.googleLogin(db, '1001', 'G').ok, true)
  assert.equal(K.googleLogin(db, '2002', 'G2').code, 'RATE_LIMITED')
})

test('admin sets both prices, orders snapshot duration, only the accountant issues keys once', () => {
  const { db, admin, acct, user } = fresh()
  assert.equal(K.createOrder(db, user, 1).code, 'PRICE_NOT_CONFIGURED')
  assert.equal(K.setPrice(db, user, 60000, 450000).code, 'FORBIDDEN')
  assert.equal(K.setPrice(db, admin, 0, 450000).code, 'INVALID_INPUT')
  K.setPrice(db, admin, 60000, 450000)
  const { order } = K.createOrder(db, user, 2)
  const monthly = K.createOrder(db, user, 1, 1).order
  assert.equal(K.createOrder(db, user, 1, 2).code, 'INVALID_INPUT')
  K.setPrice(db, admin, 70000, 500000)
  assert.deepEqual([order.months, order.unitPrice, order.total, order.status], [12, 450000, 900000, 'PENDING'])
  assert.deepEqual([monthly.months, monthly.unitPrice, monthly.total], [1, 60000, 60000])
  assert.equal(K.decideOrder(db, admin, order.id, 'approve').code, 'FORBIDDEN')
  assert.equal(K.decideOrder(db, acct, order.id, 'approve').issued, 2)
  assert.equal(K.decideOrder(db, acct, monthly.id, 'approve').issued, 1)
  assert.equal(K.decideOrder(db, acct, order.id, 'approve').code, 'ORDER_NOT_PAYABLE')
  assert.deepEqual(db.keys.map(key => key.months).sort((a, b) => a - b), [1, 12, 12])
})

test('assigning is limited to own rooms and available keys', () => {
  const { db, user, order } = issued()
  const [first] = db.keys
  assert.equal(K.assignKey(db, user, first.id, 'TING-9999-9999-9999-9999').code, 'FORBIDDEN')
  assert.equal(K.assignKey(db, user, first.id, db.rooms[0].ting).ok, true)
  assert.equal(K.assignKey(db, user, first.id, db.rooms[0].ting).code, 'KEY_NOT_AVAILABLE')
  assert.equal(order.quantity, 2)
})

test('refund re-checks activation at approval time and blocks activated keys for good', () => {
  const { db, acct, user, order } = issued()
  const [assigned, spare] = db.keys
  K.assignKey(db, user, assigned.id, db.rooms[0].ting)
  const both = K.requestRefund(db, user, order.id, [assigned.id, spare.id]).refund
  assert.equal(K.requestRefund(db, user, order.id, [spare.id]).code, 'REFUND_NOT_ALLOWED')
  K.activateKey(db, assigned.id)
  assert.deepEqual([K.decideRefund(db, acct, both.id, 'approve').status, both.reason], ['REJECTED', 'KEY_ACTIVATED'])
  assert.equal(K.keyStatus(spare), 'AVAILABLE')
  assert.equal(K.requestRefund(db, user, order.id, [assigned.id]).code, 'REFUND_NOT_ALLOWED')
  const ok = K.requestRefund(db, user, order.id, [spare.id]).refund
  assert.equal(K.decideRefund(db, acct, ok.id, 'approve').status, 'APPROVED')
  assert.deepEqual(db.keys.map(K.keyStatus), ['ACTIVATED', 'REFUNDED'])
})


test('admin user management: roles, lock takes effect on login, no self lock, password reset', () => {
  const { db, admin, acct, user } = fresh()
  assert.equal(K.createAdmin(db, acct, 'x', 'X', 'a-long-password-1', 'ACCOUNTANT').code, 'FORBIDDEN')
  assert.equal(K.createAdmin(db, admin, 'bad', 'X', 'a-long-password-1', 'TECHNICIAN').code, 'INVALID_INPUT')
  assert.equal(K.createAdmin(db, admin, 'ktv-hcm', 'X', 'a-long-password-1', 'ACCOUNTANT').code, 'CONFLICT')
  assert.equal(K.createAdmin(db, admin, 'admin-2', 'Admin 2', 'a-long-password-1', 'SUPER_ADMIN').ok, true)
  assert.equal(K.createAdmin(db, admin, 'operator-2', 'Vận hành 2', 'a-long-password-1', 'OPERATOR').ok, true)
  assert.equal(K.login(db, 'staff', 'operator-2', 'a-long-password-1').ok, true)
  assert.equal(K.login(db, 'staff', 'admin-2', 'a-long-password-1').ok, true)
  assert.equal(K.setAdminActive(db, admin, 'admin', false).code, 'FORBIDDEN')
  assert.equal(K.setAdminActive(db, admin, 'ke-toan', false).ok, true)
  assert.equal(K.login(db, 'staff', 'ke-toan', 'demo-ketoan').code, 'ACCOUNT_DISABLED')
  K.setAdminActive(db, admin, 'ke-toan', true)
  assert.equal(K.setAdminPassword(db, admin, 'ke-toan', 'short').code, 'INVALID_INPUT')
  K.setAdminPassword(db, admin, 'ke-toan', 'new-long-password-1')
  assert.equal(K.login(db, 'staff', 'ke-toan', 'demo-ketoan').code, 'INVALID_CREDENTIALS')
  assert.equal(K.login(db, 'staff', 'ke-toan', 'new-long-password-1').ok, true)
  assert.equal(K.setAdminActive(db, user, 'ke-toan', false).code, 'FORBIDDEN')
  assert.equal(K.setAdminActive(db, admin, 'ktv-hcm', false).code, 'NOT_FOUND')
})

test('delivery note: Mẫu 02-VT numbering, snapshot, one active note per order, accountant-only actions, amount in words', () => {
  const { db, admin, acct, user } = fresh()
  K.setPrice(db, admin, 70000, 500000)
  const agent = K.register(db, 'agent-new', 'Đại lý mới', 'a-long-password-1').user
  assert.equal(K.createOrder(db, agent, 1).code, 'PROFILE_INCOMPLETE')
  const profile = { name: 'Cyber Bình Minh', taxCode: '0301234567', address: '45 Lê Lợi', phone: '0900 222 333', contact: 'Zalo 0900 222 333' }
  for (const bad of [{ taxCode: '' }, { taxCode: '123' }, { address: ' ' }, { phone: 'abc' }, { name: '' }]) assert.equal(K.setProfile(db, agent, { ...profile, ...bad }).code, 'INVALID_INPUT')
  assert.equal(K.setProfile(db, acct, profile).code, 'FORBIDDEN')
  assert.equal(K.setProfile(db, agent, profile).ok, true)
  const { order } = K.createOrder(db, agent, 12, 12, 'Giao cuối tháng')
  K.setProfile(db, agent, { ...profile, address: 'Địa chỉ mới' })
  assert.deepEqual([order.buyer.address, order.buyer.contact, order.note], ['45 Lê Lợi', 'Zalo 0900 222 333', 'Giao cuối tháng'], 'đơn giữ bản chụp hồ sơ')
  assert.equal(K.createNote(db, acct, order.id).code, 'ORDER_NOT_PAYABLE')
  K.decideOrder(db, acct, order.id, 'approve')
  assert.equal(K.createNote(db, acct, order.id).code, 'COMPANY_NOT_CONFIGURED')
  assert.equal(K.setCompany(db, user, { name: 'x', address: 'y', taxCode: '0312345678' }).code, 'FORBIDDEN')
  assert.equal(K.setCompany(db, admin, { name: 'x', address: 'y', taxCode: '12' }).code, 'INVALID_INPUT')
  assert.equal(K.setCompany(db, admin, { name: 'Công ty Ting', address: '1 Nguyễn Huệ', taxCode: '0312345678' }).ok, true)
  assert.equal(K.createNote(db, admin, order.id).code, 'FORBIDDEN')
  const first = K.createNote(db, acct, order.id).note
  assert.deepEqual([first.no, first.receiver, first.taxCode, first.months, first.total, first.warehouse], ['PXK-2026-000001', 'Cyber Bình Minh', '0301234567', 12, 6000000, 'Kho phần mềm'])
  assert.equal(K.createNote(db, acct, order.id).code, 'DELIVERY_NOTE_EXISTS')
  K.setCompany(db, acct, { name: 'Công ty Đổi Tên', address: '2 Lê Lợi', taxCode: '0312345678' })
  assert.equal(first.company.name, 'Công ty Ting')
  assert.equal(K.cancelNote(db, admin, first.id, 'x').code, 'FORBIDDEN')
  assert.equal(K.cancelNote(db, acct, first.id, ' ').code, 'INVALID_INPUT')
  assert.equal(K.cancelNote(db, acct, first.id, 'Sai tên').ok, true)
  assert.equal(K.cancelNote(db, acct, first.id, 'lại').code, 'NOT_FOUND')
  assert.equal(K.createNote(db, acct, order.id).note.no, 'PXK-2026-000002')
  for (const [amount, words] of [[6000000, 'Sáu triệu đồng chẵn'], [1000005, 'Một triệu không trăm lẻ năm đồng chẵn'], [21, 'Hai mươi mốt đồng chẵn'], [15000, 'Mười lăm nghìn đồng chẵn']]) assert.equal(K.vndInWords(amount), words)
})

test('inline validation mirrors the real Console rules', () => {
  const v = K.validate
  assert.match(v('company', 'tax', '00111234590'), /Mã số thuế gồm/)
  for (const ok of ['0312345678', '031234567890', '0312345678901', '0312345678-001']) assert.equal(v('company', 'tax', ok), '')
  assert.match(v('company', 'name', ''), /không được để trống/)
  assert.match(v('register', 'id', 'có dấu'), /Mã tài khoản chỉ gồm/)
  assert.match(v('register', 'id', 'g_1'), /g_/)
  assert.equal(v('admin', 'id', 'g_1'), '')
  assert.match(v('register', 'password', 'ngan'), /12 đến 128/)
  assert.match(v('register', 'confirm', 'a', { password: 'b' }), /không khớp/)
  assert.equal(v('register', 'confirm', 'b', { password: 'b' }), '')
  assert.match(v('order', 'q', '0'), /từ 1 đến 500/)
  assert.match(v('order', 'q', '1.5'), /số nguyên/)
  assert.match(v('order', 'note', 'x'.repeat(501)), /tối đa 500/)
  assert.match(v('profile', 'tax', ''), /không được để trống/)
  assert.match(v('profile', 'phone', ''), /Số điện thoại không được để trống/)
  assert.match(v('profile', 'phone', 'xx'), /Số điện thoại chỉ gồm/)
  assert.match(v('price', 'p1', '100000001'), /từ 1 đến 100\.000\.000/)
  assert.equal(v('unknown', 'x', 'anything'), '')
  assert.ok(K.fieldsOf('company').includes('tax'))
})
