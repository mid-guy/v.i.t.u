# Changelog

All notable changes to this project will be documented in this file.
Chi tiết vì sao sai và sửa như nào cho từng mục: xem [DEVLOG.md](DEVLOG.md).

## [Unreleased]

### Added

- `r-for` — render list như `v-for` của Vue. Cú pháp duy nhất
  `r-for="(item, index) in items"` (từ khóa `in`/`of`/`from`), tự thêm
  `key={index}` khi chưa khai báo `key`, xử lý trước `r-if` để điều kiện dùng
  được biến vòng lặp. (DEVLOG #1, #3)
- Extension `vscode-vitu`: IntelliSense (hover, completion, go-to-definition,
  diagnostics) cho directive `r-for`/`v-for` — hoạt động cả trong chuỗi
  directive lẫn trong thân element, trên JSX và TSX. (DEVLOG #4, #5)
- `typescript-vitu-plugin` — tsserver plugin chặn hover `any` và lỗi
  `Cannot find name` giả mà TS built-in sinh ra cho biến vòng lặp. (DEVLOG #6)
- Semantic highlighting cho biến vòng lặp trong thân element, dùng lại màu
  mặc định của theme. (DEVLOG #7)
- Cấu hình `.vscode/launch.json` ở gốc repo để F5 chạy Extension Development
  Host và debug smoke test.

### Changed

- `r-for` chỉ chấp nhận một format `(item, index) in items`; bỏ dạng
  `item in items`. (DEVLOG #3)

### Fixed

- `r-else` bị ghi thẳng ra DOM (React cảnh báo "Received `true` for a
  non-boolean attribute") do `_removeAttr` luôn xóa attribute trên element
  `r-if` thay vì element `r-else`. (DEVLOG #2)

### Known issues

- `rollup.config.cjs` trỏ `input` vào `scripts/index.js` trong khi file thật
  là `scripts/index.cjs` — `pnpm build` sẽ fail và `dist/` đang cũ (chỉ có
  bản `r-if` đầu tiên).

## [1.0.0] - 2024-11-03

### Added

- Initial release of `babel-plugin-v.i.t.u` plugin.
- Experimental support for the `r-if` feature.
