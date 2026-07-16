# vitu-language-features

VSCode extension đem IntelliSense vào bên trong directive dạng chuỗi của V.I.T.U:

```jsx
<li r-for="(item, index) in items">...</li>
```

Bình thường VSCode coi `"(item, index) in items"` là một string, và `item`/`index`
dùng trong thân element là biến không tồn tại. Extension này dùng đúng
kỹ thuật của Volar (Vue): sinh **virtual document** — bản sao file trong đó
cả element được bọc vào TSX thật, giống hệt transform lúc runtime:

```jsx
{[...(items)].map((item, index) => <li>{item.message}</li>)}
```

rồi chạy TypeScript LanguageService trên bản virtual và map kết quả ngược về
vị trí gốc — cả trong chuỗi directive lẫn trong thân element. Cú pháp duy nhất
là `"(item, index) in items"` (`r-for` / `v-for`, từ khóa `in` / `of` / `from`).

## Tính năng

- **Completion** bên trong biểu thức (`texts`, `users.fil…`) và trong thân element
  (`item.` ra danh sách property) — gõ `.` hoặc Ctrl+Space
- **Hover** — `item`/`index` hiện đúng type suy ra từ phần tử mảng, kể cả khi dùng
  trong children (vd `{item.message}`)
- **Go to definition** từ trong chuỗi/thân element về biến gốc
- **Diagnostics** — sai tên biến, biểu thức không iterable, sai property trong thân…
  gạch đỏ đúng chỗ; mọi lỗi ngoài phạm vi r-for được lọc bỏ để không trùng với
  TS server có sẵn

## Chạy thử

```bash
pnpm install
pnpm test          # smoke test phần lõi, không cần VSCode
```

Mở thư mục `vscode-vitu` trong VSCode rồi nhấn **F5** → Extension Development Host
mở sẵn `example/App.jsx` để nghịch.

## Kiến trúc

- `lib/virtual.js` — dùng parser của TypeScript tìm element mang directive, bọc cả
  element vào `.map(...)` + bảng mapping offset hai chiều (segment cho
  `item`/`index`/`expr`, ident chunk cho phần copy nguyên văn, scope cho thân element)
- `lib/service.js` — `ts.createLanguageService` đọc filesystem thật, riêng file
  đang mở thì override bằng nội dung virtual
- `extension.js` — đăng ký completion/hover/definition provider và diagnostics,
  chỉ trả lời khi con trỏ nằm trong phạm vi r-for (ngoài ra nhường TS built-in)
- `typescript-vitu-plugin/` — plugin nạp vào tsserver built-in của VSCode
  (`contributes.typescriptServerPlugins`): chặn hover `any` và lỗi
  "Cannot find name" mà TS built-in sinh ra cho biến vòng lặp bên trong element
  có r-for, để tooltip chỉ còn kết quả đúng từ extension
