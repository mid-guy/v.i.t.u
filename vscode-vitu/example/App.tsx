type User = { id: number; name: string };

const users: User[] = [
	{ id: 1, name: 'An' },
	{ id: 2, name: 'Binh' },
];
const title = 'Danh sách';

export default function App() {

	return (
		<div>
			<h1>{title}</h1>

			{/* Hover `user`/`index`, gõ `user.` để xem completion đúng type User */}
			<li r-for="(user, index) in users">
				{index} - {user.name}
			</li>

			{/* Sai property -> extension gạch đỏ `namez` đúng chỗ */}
			<span r-for="(u, i) in users">{u.namez}</span>
		</div>
	);
}
