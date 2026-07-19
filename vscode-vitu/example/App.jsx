import React, { useState } from 'react';

const parentMessage = 'Parent';

/**
 * Scoped slot: `<slot>` truyền dữ liệu ra ngoài, không cần khai báo kiểu cho
 * `children` — kiểu của slot được suy thẳng từ các attribute ở đây.
 *
 * @param {{ rows: { id: number, label: string }[] }} props
 */
function List({ rows }) {
	return (
		<ul>
			<li r-for="(row, i) in rows">
				<slot item={row} index={i}>{'chưa truyền slot'}</slot>
			</li>
		</ul>
	);
}

export default function App() {
	const items = [{ message: 'Foo' }, { message: 'Bar' }];
		const parentMessage = 'Parent';
	const texts = ['Hello', 'beta'];
	const users = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh' }];
	const texts = ['Hello', 'beta'];
	const isVisible = true;
	const rows = [{ id: 1, label: 'one' }, { id: 2, label: 'two' }];

	return (
		<div>
			<li r-for="(item, index) in items">
					{parentMessage} - {index} - {item.message}
			</li>
			{items.map((item, index) => (
				<li key={index}>
					{parentMessage} - {index} - {item.message}
				</li>
			))}
			{/* Hover vào `text`/`texts`, Ctrl+Space hoặc gõ `.` bên trong chuỗi */}
			<p r-for="(text, i) from texts">{'row'}</p>

			{/* Cố tình sai tên biến -> gạch đỏ ngay trong chuỗi */}
			{/* <span r-for="(user, i) of userz">{'row'}</span> */}

			{/* Hover `user` ra object, `index` ra number */}
			<li r-for="(user, index) in users">{'row'}</li>

			{/* r-show chỉ nhận boolean: hover/completion trong biểu thức */}
			<p r-show={isVisible}>{'shown'}</p>

			{/* Không phải boolean -> gạch đỏ "not assignable to boolean" */}
			{/* <p r-show={parentMessage}>{'x'}</p> */}

			{/* r-show cùng element với r-for: thấy được loop binding */}
			<li r-for="(user, i) in users" r-show={user.id === 1}>{'row'}</li>

			{/* r-slot: hover `item` ra { id, label }, gõ `item.` ra property,
			    sai tên property thì gạch đỏ — không khai báo children ở đâu cả */}
			<List rows={rows} r-slot="{ item, index }">
				<b>{index} - {item.label}</b>
			</List>
		</div>
	);
}
