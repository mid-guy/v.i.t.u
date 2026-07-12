export default function App() {
	const texts = ['Hello', 'beta'];
	const users = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh' }];

	return (
		<div>
			{/* Hover vào `text`/`texts`, Ctrl+Space hoặc gõ `.` bên trong chuỗi */}
			<p r-for="text from texts">{'row'}</p>

			{/* Cố tình sai tên biến -> gạch đỏ ngay trong chuỗi */}
			<span r-for="user of userz">{'row'}</span>
		</div>
	);
}
