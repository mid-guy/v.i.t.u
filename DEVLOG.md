# DEVLOG — nhật ký phát triển

Bám theo các mục trong [CHANGELOG.md](CHANGELOG.md). Mỗi mục ghi lại: chuyện gì
xảy ra, **tại sao sai**, **sửa như nào**, và **bài học** rút ra.

---

## #1 — Transform `r-for`: output là text chứ không phải expression (2026-07-16)

**Chuyện gì xảy ra.** Bản đầu của `handleRFor()` trong `scripts/index.cjs` gọi
`path.replaceWith(mapCall)` và tin rằng Babel sẽ tự lo phần còn lại. Kết quả
compile ra `<ul>items.map(...)</ul>` — cả biểu thức `.map` thành **text node**
nằm chình ình trong JSX.

**Tại sao sai.** Babel không tự bọc expression vào `JSXExpressionContainer`
khi node cha là JSX element. `replaceWith` làm đúng nghĩa đen: thay node này
bằng node kia, còn hợp lệ hay không là việc của mình.

**Sửa như nào.** Kiểm tra `path.parentPath`: nếu là `JSXElement`/`JSXFragment`
thì bọc `mapCall` trong `t.jSXExpressionContainer(...)` trước khi thay.

**Bài học.** Đừng chỉ nhìn AST output "trông có vẻ đúng" — phải render thật.
Bài test quyết định là chạy `renderToStaticMarkup` qua react-dom/server và so
HTML, chính nó bắt được lỗi này ngay lập tức.

---

## #2 — Bug `r-else` có sẵn: xóa attribute nhầm element (2026-07-16)

**Chuyện gì xảy ra.** Khi verify `r-for` bằng render thật, React cảnh báo:
`Received `true` for a non-boolean attribute `r-else``. Bug này tồn tại từ
trước, không liên quan `r-for` — nhưng chỉ lộ ra khi render end-to-end.

**Tại sao sai.** `_removeAttr(attr)` hard-code thao tác trên `this.node`
(element mang `r-if`), trong khi attribute `r-else` cần xóa nằm trên **element
anh em**. Hàm filter chạy êm, không ném lỗi — chỉ là không xóa được gì, và
`r-else` đi thẳng ra DOM.

**Sửa như nào.** Thêm tham số đích: `_removeAttr(attr, node = this.node)`, chỗ
xử lý nhánh else truyền `elsePath.node` vào.

**Bài học.** Helper mặc định thao tác trên `this` là bẫy khi xử lý nhiều node
cùng lúc. Và warning của React là tín hiệu thật, không phải noise — output
render "trông đúng" nhưng console bẩn nghĩa là vẫn còn bug.

---

## #3 — Chốt một format duy nhất `(item, index) in items` (2026-07-17)

**Chuyện gì xảy ra.** Ban đầu hỗ trợ cả `item in items` lẫn
`(item, index) in items` (index optional, tự sinh `_index` khi thiếu).
Sau đó quyết định bỏ dạng trần, chỉ giữ dạng có ngoặc.

**Tại sao đổi.** Hai cú pháp nghĩa là: hai nhánh regex, hai nhánh sinh code
(uid `_index` vs identifier thật), hai bộ test — ở **cả hai nơi** (plugin Babel
và extension VSCode), và chúng phải khớp nhau từng li. Mỗi lần thêm tính năng
là sửa đôi. Một format bắt buộc làm regex đơn giản hơn, thông báo lỗi chỉ còn
một câu, và loại luôn khả năng plugin/extension lệch cú pháp.

**Bài học.** Với DSL tự thiết kế, "hỗ trợ nhiều cách viết" là nợ, không phải
tiện. Khi cùng một cú pháp phải được parse ở nhiều tầng (compile + editor
tooling), số biến thể nên là nhỏ nhất có thể.

---

## #4 — Extension v1: hover trong thân element ra `any` (2026-07-17)

**Chuyện gì xảy ra.** Virtual document v1 chỉ viết lại **attribute**:
`r-for="(item, index) in items"` → `r-for={[...(items)].map((item, index) => item)}`.
Hover trong chuỗi thì đẹp, nhưng hover `{item.message}` trong **thân element**
ra `any`.

**Tại sao sai.** Với TypeScript, `item` trong thân element vẫn là biến không
tồn tại — binding chỉ sống bên trong attribute đã viết lại, không phủ ra
children. Virtual document mới chỉ làm chuỗi "parse được", chứ chưa tái hiện
**ngữ nghĩa runtime** (Babel bọc cả element vào callback của `.map`).

**Sửa như nào.** Viết lại `lib/virtual.js`: dùng chính parser của TypeScript
(`ts.createSourceFile`) tìm element mang directive — regex không thể xác định
ranh giới element (tag lồng nhau, self-closing) — rồi bọc **nguyên element**:
`{[...(items)].map((item, index) => <li>...children...</li>)}`. Thêm khái niệm
`scopes` (phạm vi element có r-for) để extension chỉ trả lời trong phạm vi đó,
ngoài ra vẫn nhường TS built-in.

**Bài học.** Virtual document phải mô phỏng đúng **những gì code sẽ là lúc
runtime**, không phải phiên bản "đủ để hết lỗi parse". Và khi cần ranh giới
cú pháp thật (element bắt đầu/kết thúc ở đâu) thì dùng parser thật — regex chỉ
đủ cho token phẳng.

---

## #5 — Hover ra `any` dù mapping đúng: thiếu types của React (2026-07-17)

**Chuyện gì xảy ra.** Example đổi sang `const [items] = useState(...)` — hover
`item` lập tức ra `any` dù virtual document sinh đúng.

**Tại sao sai.** Không phải bug logic: language service của extension không
resolve được module `'react'` (thư mục `vscode-vitu` chưa cài
`react`/`@types/react`), nên `useState` là `any`, kéo theo cả chuỗi suy luận
sập về `any`. Mảng literal (`const users = [...]`) không sao vì type suy thẳng
từ giá trị.

**Sửa như nào.** `pnpm add -D react @types/react` trong `vscode-vitu`. Với
project thật của người dùng thì không cần — `react` luôn có sẵn trong
`node_modules` của họ.

**Bài học.** Khi language service trả `any`, nghi phạm số một là **module
resolution đứt**, không phải mapping sai. Kiểm tra import resolve được chưa
trước khi debug logic của mình.

---

## #6 — Tooltip thừa một dòng `any`: hover bị gộp từ nhiều provider (2026-07-17)

**Chuyện gì xảy ra.** Sau #4, hover `item.message` ra đúng
`(property) message: string`… kèm thêm một dòng `any` lơ lửng bên dưới.

**Tại sao sai.** Tooltip của VSCode **gộp kết quả của mọi hover provider**.
Dòng đúng là của extension; dòng `any` là của TS server built-in — nó nhìn file
gốc, nơi `item` không tồn tại, và quick info cho identifier không resolve được
là `any`. Extension API không có cách nào xóa kết quả của provider khác.

**Sửa như nào.** Làm theo cách Volar (Vue): viết `typescript-vitu-plugin` nạp
vào tsserver built-in qua `contributes.typescriptServerPlugins`. Plugin proxy
language service, chỉ can thiệp 2 hàm: chặn quick info tại identifier **không
resolve được symbol** nằm trong element có r-for, và lọc diagnostics
`Cannot find name` (2304/2552) trong cùng phạm vi — quan trọng cho `.tsx`, nơi
TS built-in thực sự type-check. Ngoài phạm vi r-for, mọi thứ pass-through
nguyên vẹn; `tsc`/CI không bị ảnh hưởng vì plugin chỉ sống trong editor.

**Bài học.** Giới hạn của extension API không phải ngõ cụt — tầng đúng để can
thiệp hành vi TS built-in là tsserver plugin, kênh chính thức mà Volar cũng
dùng. Điều kiện chặn phải hẹp nhất có thể (symbol unresolved + trong scope)
để không nuốt nhầm thông tin thật.

---

## #7 — `user.name` trong body trắng "phèn": semantic highlighter mù (2026-07-17)

**Chuyện gì xảy ra.** Code trong thân element r-for không có màu — `user.name`
trắng toát, trong khi cùng đoạn đó viết `.map()` tay thì màu đầy đủ.

**Tại sao sai.** Semantic token của TS built-in chỉ phát cho identifier resolve
được. `user`/`index` với nó là biến lạ → không có token → rớt về màu TextMate
mặc định.

**Sửa như nào.** Extension đã có classifications từ virtual document (nơi
`user` là parameter thật) nhưng chỉ dùng cho phần trong chuỗi directive. Mở
rộng: classify **cả file virtual**, map từng span ngược về source, áp
decoration cho token nằm trong `scopes`. Màu dùng lại đúng bảng semantic mặc
định của Dark+/Light+ (xanh nhạt biến/property, vàng hàm, xanh ngọc type).

**Bài học.** Highlight cho DSL nên làm code trông **giống code thường**, không
phải nổi bật hơn (tham khảo bài syntax highlighting của Tonsky) — tái dùng màu
theme thay vì bịa bảng màu riêng. Điểm nhấn duy nhất đáng giữ: gạch chân nội
dung directive và màu keyword `in`/`of`/`from` để đánh dấu "đây là DSL".

---

## #8 — Scoped slot: `<slot>` lấy `children` từ đâu (2026-07-19)

**Chuyện gì xảy ra.** Thêm cặp directive scoped slot: `<slot item={row} />`
bên trong component đẩy dữ liệu ra, `r-slot="{ item }"` phía gọi nhận về. Bản
transform đầu lấy `children` bằng `path.getFunctionParent()` — và hỏng ngay khi
outlet nằm trong `r-for`.

**Tại sao sai.** Sau khi `handleRFor()` chạy, element đã bị bọc vào
`.map((row, i) => ...)`. Function parent gần nhất của `<slot>` không còn là
component nữa mà là **callback của `.map`**, params của nó là loop binding —
`children` thành `row.children`. Cùng chuyện đó xảy ra với `.map()` viết tay.

**Sửa như nào.** `_childrenRef()` leo tiếp chừng nào function cha còn là
**argument của một CallExpression** (dấu hiệu của callback), rồi mới dừng ở
component thật. Nếu component chưa destructure `children` thì chèn binding vào
params — tác giả không phải khai báo gì.

**Bài học.** Trong một visitor chạy nhiều directive trên cùng element, thứ tự
transform là một phần của ngữ nghĩa: `getFunctionParent()` trả lời cho **AST
sau khi đã sửa**, không phải AST tác giả viết. Đi tìm "component" thì phải mô
tả được component khác callback ở chỗ nào.

---

## #9 — Type cho slot mà không bắt khai báo `children` (2026-07-19)

**Chuyện gì xảy ra.** Slot chạy đúng lúc runtime, nhưng trong editor `item`
của `r-slot="{ item }"` là `any`. Muốn có type thì bình thường phải bắt tác giả
tự viết kiểu cho `children` — đúng thứ mà cả hai bên Vue lẫn directive này cố
tránh.

**Tại sao khó.** Kiểu của slot nằm ở **chỗ khác file khác** với nơi tiêu thụ nó:
nó sinh ra từ các attribute trên `<slot>` bên trong component (và có thể nằm
trong một hay nhiều `r-for` lồng nhau), còn nơi cần nó là thân element `r-slot`
ở call site. Không có kênh nào sẵn để type đi từ chỗ này sang chỗ kia.

**Sửa như nào.** Cho type đi nhờ **return type của component**. Trong virtual
document: mỗi outlet sinh một const bắt kiểu, **replay lại đúng chuỗi `r-for`
bao quanh** để các expression nhìn thấy loop binding
(`const __vituS0 = [...(data)].map((entry, i) => ({ item: (entry), index: (i) }))[0]`);
mọi `return` của component bọc trong `__vituCapture(jsx, __vituS0)` khai báo
`J & { __vituSlots: S }`; phía call site, children thành render function có
tham số `__VituSlots<typeof List>` — `.tsx` annotate thẳng, `.jsx` dùng JSDoc
`@type`. Hai helper sống trong một `.d.ts` ảo do `lib/service.js` bơm vào.

**Bài học.** Muốn type chảy qua ranh giới module thì phải gắn nó vào thứ
TypeScript vốn đã mang qua ranh giới đó — ở đây là return type. Điều kiện duy
nhất còn lại là props của component có kiểu (JSDoc hoặc TS), giống hệt vai trò
của `defineProps` bên Vue.

---

## #10 — Slot qua `import`: virtual hóa cả file không mở (2026-07-19)

**Chuyện gì xảy ra.** #9 chạy ngon khi component và call site **cùng một file**.
Tách `List` ra `./Slots` rồi import vào là `item` trở lại `any`.

**Tại sao sai.** Language service chỉ override nội dung của **file đang mở**;
file import vào được đọc thẳng từ đĩa. Mà trên đĩa `List` vẫn còn `<slot>` và
`r-for` — cú pháp mà TS không hiểu, và tuyệt nhiên không có `__vituCapture` nào
để mang type ra. Return type của nó vô dụng.

**Sửa như nào.** `getScriptSnapshot` chạy `buildVirtual` **lúc đọc file** cho
mọi source file có dấu hiệu directive (`SCRIPT_EXT_RE` + `DIRECTIVE_HINT_RE`),
lỗi thì rơi về nội dung gốc. Hai gạn lọc để rẻ: chỉ file script, và chỉ khi
content khớp regex — file thường không trả giá gì.

**Bài học.** "Virtual document" không phải là chuyện của riêng buffer đang mở.
Hễ một type phải đi xuyên `import`, thì **mọi file trên đường đi** đều phải là
bản virtual — nếu không, ranh giới module chính là chỗ type chết.

---

## #11 — Dọn nhiễu quanh slot: sai chỗ, sai lỗi, và lỗi trùng (2026-07-19)

**Chuyện gì xảy ra.** Slot type đúng rồi thì lộ ba loại gạch đỏ giả: attribute
trên `<slot>` bị TS chửi là prop lạ của `HTMLSlotElement`; element mang `r-slot`
bị chửi prop không khớp; và một lỗi thật trong `r-slot` hiện **hai lần**.

**Tại sao sai.** Ba nguyên nhân khác nhau, không gộp được:
`<slot>` với TS built-in là web-component tag có sẵn; children của element
`r-slot` chỉ là render function **sau transform**, trước đó vẫn là JSX thường
nên không khớp props; còn lỗi trùng là do chính #9 — capture replay lại chuỗi
`r-for`, nên một expression sai có **hai bản sinh** cùng map về một span nguồn.

**Sửa như nào.** Trong `typescript-vitu-plugin`: mute toàn bộ attribute của
`<slot>`, và lọc riêng nhóm code lỗi prop (2322/2339/2559/2739/2740/2769)
**chỉ trong opening tag** của element có `r-slot`. Trong extension: dedupe
diagnostics theo khóa `start:end:code` sau khi map về nguồn.

**Bài học.** Sinh code có bản sao thì diagnostics cũng có bản sao — dedupe là
phần bắt buộc của pipeline mapping, không phải chi tiết làm đẹp. Và mỗi lần
chặn lỗi của TS built-in, phạm vi phải hẹp đến mức mô tả được bằng một câu
("prop error, trong opening tag, của element có r-slot") — rộng hơn là bắt đầu
nuốt lỗi thật.

---

## Quy ước rút ra cho project

1. **Verify bằng render thật**, không dừng ở so sánh code sinh ra (#1, #2).
2. **Một cú pháp, nhiều tầng parse** — Babel plugin và extension phải cùng một
   grammar; giữ grammar nhỏ nhất có thể (#3).
3. **Virtual document = ngữ nghĩa runtime**, mô phỏng đúng transform thật (#4).
4. `any` bất thường → kiểm tra **module resolution trước, logic sau** (#5).
5. Can thiệp TS built-in thì dùng **tsserver plugin**, can thiệp hẹp nhất có
   thể (#6).
6. Thứ tự transform là ngữ nghĩa: helper đi tìm node cha phải đúng với AST
   **sau khi** các directive khác đã chạy (#8).
7. Type đi xuyên `import` thì gắn vào **return type**, và virtual hóa mọi file
   trên đường đi, không chỉ file đang mở (#9, #10).
8. Sinh code có bản sao → **dedupe diagnostics** theo span nguồn; chặn lỗi TS
   built-in thì phạm vi phải hẹp đến mức mô tả bằng một câu (#11).
9. **Dùng pnpm** cho mọi thao tác cài đặt trong repo này.
10. Việc còn treo: sửa `input` trong `rollup.config.cjs` và build lại `dist/`.
