# vitu-language-features

VSCode extension đem IntelliSense vào bên trong directive dạng chuỗi của V.I.T.U:

```jsx
<p r-for="text from texts">...</p>
```

Bình thường VSCode coi `"text from texts"` là một string. Extension này dùng đúng
kỹ thuật của Volar (Vue): sinh **virtual document** — bản sao file trong đó
directive được thay bằng TSX thật:

```jsx
<p r-for={[...(texts)].map((text) => text)}>...</p>
```

rồi chạy TypeScript LanguageService trên bản virtual và map kết quả ngược về
vị trí trong chuỗi gốc. Hỗ trợ `r-for` / `v-for` với `from` / `of` / `in`.

## Tính năng

- **Completion** bên trong biểu thức (`texts`, `users.fil…`) — gõ `.` hoặc Ctrl+Space
- **Hover** — `text` hiện đúng type suy ra từ phần tử mảng (vd `(parameter) text: string`)
- **Go to definition** từ trong chuỗi về biến gốc
- **Diagnostics** — sai tên biến, biểu thức không iterable… gạch đỏ ngay trong chuỗi;
  mọi lỗi ngoài directive được lọc bỏ để không trùng với TS server có sẵn

## Chạy thử

```bash
pnpm install
pnpm test          # smoke test phần lõi, không cần VSCode
```

Mở thư mục `vscode-vitu` trong VSCode rồi nhấn **F5** → Extension Development Host
mở sẵn `example/App.jsx` để nghịch.

## Kiến trúc

- `lib/virtual.js` — regex tìm directive, sinh virtual text + bảng mapping offset
  hai chiều (segment cho `item`/`expr`, ident chunk cho phần còn lại)
- `lib/service.js` — `ts.createLanguageService` đọc filesystem thật, riêng file
  đang mở thì override bằng nội dung virtual
- `extension.js` — đăng ký completion/hover/definition provider và diagnostics,
  chỉ trả lời khi con trỏ nằm trong directive (ngoài ra nhường TS built-in)
