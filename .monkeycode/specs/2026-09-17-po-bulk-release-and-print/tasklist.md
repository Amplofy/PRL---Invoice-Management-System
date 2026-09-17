# 需求实施计划

- [x] 1. 后端：在 `backend/src/services/poFinance.ts` 抽取可复用的纯函数
  - [x] 1.1 新增 `isAwaitingFinance(status)`:归一化状态并判断是否等于 `Generated`
    - 覆盖 Requirement 2.3/2.9、Requirement 3.4/3.8
  - [x] 1.2 新增 `releasePatch({ email, now, releasedAmount, releasedVia, releaseReference, remarks })`:返回 `po_versions` 置 `Cleared` 的更新对象,写入 finance 与 release 字段
    - 覆盖 Requirement 2.4/2.5、Correctness Property 2
  - [x] 1.3 新增 `rejectPatch({ email, now, reason })`:返回置 `Rejected` 的更新对象,清空 `released_amount/released_by/released_at/released_via/release_reference`
    - 覆盖 Requirement 3.4/3.5、Correctness Property 5
  - [x] 1.4 新增 `bulkSummary(results)`:汇总 released/rejected、skipped、failed 与对应 PO 序列号列表
    - 覆盖 Requirement 2.10、Requirement 3.9
  - [x] 1.5 为 `isAwaitingFinance`、`releasePatch`、`rejectPatch`、`bulkSummary` 编写单元测试
    - 覆盖 Requirement 2.4/2.5/2.9、Requirement 3.4/3.5/3.9、Correctness Property 2/5

- [x] 2. 后端：让单张释放/拒绝复用新的 patch builder
  - [x] 2.1 `POST /payment-orders/:id/approve` 改用 `isAwaitingFinance` 与 `releasePatch`,行为保持不变
    - 覆盖 Requirement 2.4/2.5
  - [x] 2.2 `POST /payment-orders/:id/reject` 改用 `rejectPatch`,行为保持不变
    - 覆盖 Requirement 3.4/3.5

- [x] 3. 后端：新增批量释放路由 `POST /payment-orders/bulk-release`
  - [x] 3.1 实现路由:finance 角色校验、空 `ids` 返回 400、逐条加载 `PO_SELECT`
    - 覆盖 Requirement 2.1/2.2
  - [x] 3.2 逐条调用 `writeBlockedForPayment`,任一命中即返回 403 `FY_LOCKED` 且整批不写入
    - 覆盖 Requirement 2.8、Correctness Property 1
  - [x] 3.3 跳过非 Awaiting Finance 的行并记录序列号;对可释放行写 `po_versions`、`po_history`(`FinanceApproved`、`PaymentReleased`)、`audit`(`FinanceClearPO`),并将关联发票置 `Paid` + `audit`(`MarkPaid`)
    - 覆盖 Requirement 2.3/2.4/2.5/2.6/2.7、Correctness Property 3/4
  - [x] 3.4 返回 `{ released, skipped, failed, skippedSerials, failedSerials }`
    - 覆盖 Requirement 2.9/2.10

- [x] 4. 后端：新增批量拒绝路由 `POST /payment-orders/bulk-reject`
  - [x] 4.1 实现路由:finance 角色校验、空 `ids` 与空 `reason` 返回 400
    - 覆盖 Requirement 3.1/3.2/3.3
  - [x] 4.2 逐条 FY 锁检查,任一命中即返回 403 `FY_LOCKED` 且整批不写入
    - 覆盖 Requirement 3.7、Correctness Property 1
  - [x] 4.3 跳过非 Awaiting Finance 的行;对可拒绝行写 `po_versions` 置 `Rejected` 并清空释放字段、写 `po_history`(`FinanceRejected`)与 `audit`(`FinanceRejectPO`)
    - 覆盖 Requirement 3.4/3.5/3.6、Correctness Property 5/6
  - [x] 4.4 返回 `{ rejected, skipped, failed, skippedSerials, failedSerials }`
    - 覆盖 Requirement 3.8/3.9

- [x] 5. 检查点 - 后端 `tsc --noEmit` 与全量测试通过(`TZ=Asia/Karachi` 与 `TZ=UTC`),如有疑问请询问用户

- [x] 6. 前端：`frontend/src/lib/poBlueprint.ts` 支持批量打印
  - [x] 6.1 从 `renderPoHtml` 抽取 `poStyleHtml(config)` 与 `poSheetHtml(config, ctx)`,并加入 `@media print { .batch-item { break-after: page } .batch-item:last-child { break-after: auto } }`
    - 覆盖 Requirement 4.3
  - [x] 6.2 新增 `paymentOrderBatchHtml(items, template)`:解析模板一次,逐条生成 context 与 sheet,单文档输出
    - 覆盖 Requirement 4.2/4.5
  - [x] 6.3 新增 `openPaymentOrderPrintBatch(items, template): boolean`;`openPaymentOrderPrint` 与 `openPaymentOrderPrintBatch` 均返回是否成功打开窗口
    - 覆盖 Requirement 4.4/4.6
  - [x] 6.4 结构测试:断言 N 个输入生成 N 个 sheet、sheet 之间存在分页标记、文档只调用一次 `window.print()`
    - 覆盖 Requirement 4.3/4.4、Correctness Property 7

- [x] 7. 前端：`frontend/src/pages/PaymentOrdersPage.tsx` 选择、动作栏与弹窗
  - [x] 7.1 新增选择状态 `selected`、`lastClickIdx` 与 `toggleSelect`(支持 Shift 范围)、`toggleAll`、`clearSelection`,以过滤排序后的视图为基准
    - 覆盖 Requirement 1.2/1.3/1.5
  - [x] 7.2 增加勾选列(表头全选 + 每行复选框),分组视图下与 `renderRow` 一致
    - 覆盖 Requirement 1.1
  - [x] 7.3 增加动作栏:选中数量与生成本额合计、清除、打印选中;finance 且存在 Awaiting Finance 行时显示批量释放与批量拒绝
    - 覆盖 Requirement 1.4、Requirement 2.1、Requirement 3.1、Requirement 4.1、Correctness Property 8
  - [x] 7.4 实现 `printSelected()`:按排序顺序映射 `{ order, extras }` 并调用 `openPaymentOrderPrintBatch`;窗口被拦截时保留选择并提示错误
    - 覆盖 Requirement 4.2/4.4/4.5/4.6
  - [x] 7.5 批量释放弹窗(共用 Released Via/Reference/Remarks)与 `bulkRelease()`:调用 `/api/payment-orders/bulk-release`,提交前对非跨年未付发票执行 `guardWrite`,成功后 toast、清空选择、保留筛选并 `load()`
    - 覆盖 Requirement 2.3/2.4/2.5、Requirement 5.1/5.3/5.4
  - [x] 7.6 批量拒绝弹窗(共用理由)与 `bulkRejectSubmit()`:调用 `/api/payment-orders/bulk-reject`;单张打印改用返回值,窗口被拦截时提示
    - 覆盖 Requirement 3.3/3.4、Requirement 4.6、Requirement 5.2/5.3/5.4

- [x] 8. 检查点 - 前端 `tsc -p tsconfig.app.json --noEmit`、`oxlint src`、`npm run build` 通过,如有疑问请询问用户
