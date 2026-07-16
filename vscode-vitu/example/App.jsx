import React, { useState } from 'react';

export default function App() {
	const items = [{ message: 'Foo' }, { message: 'Bar' }];
		const parentMessage = 'Parent';
	const texts = ['Hello', 'beta'];
	const users = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh' }];

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
		</div>
	);
}
