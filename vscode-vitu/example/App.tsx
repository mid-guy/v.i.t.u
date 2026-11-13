type User = { id: number; name: string; email?: string };

const users: User[] = [
	{ id: 1, name: 'An', email: 'an@example.com' },
	{ id: 2, name: 'Binh' },
];
const title = 'Users';

const nestedUsers = [
	{ id: 1, name: 'An', children: [{ id: 3, name: 'Children An' }] },
	{ id: 2, name: 'Binh', children: [{ id: 4, name: 'Children Binh' }] },
];

export default function App({ current }: { current?: User }) {
	return (
		<div>
			<h1>{title}</h1>

			{/* Hover `user`/`index`, type `user.` to see completions for User */}
			<li r-for="(user, index) in users">
				{index} - {user.name}
			</li>

			{/* Wrong property -> red squiggle exactly on `namez` */}
			<span r-for="(u, i) in users">{i} {u.namez}</span>

			{/* r-if narrows types in the element body: `current` is no longer undefined.
			    r-else gets the opposite branch. */}
			<p r-if={current !== undefined}>Hello {current.name}</p>
			<p r-else>Not signed in</p>

			{/* No r-if guarding it -> "'current' is possibly 'undefined'" */}
			<p>{current.name}</p>

			{/* Narrowing works inside r-for too: email is a string in the body */}
			<li r-for="(user, i) in users" r-if={user.email !== undefined}>
				{i} {user.email.toLowerCase()}
			</li>
			<ul>
				<li r-for="(user, i) in nestedUsers" r-if={user.id > 1} r-show={i % 2 === 0}>
					{user.name}
					<ul>
						<li r-for="(child, j) in user.children" r-if={child.id > 3} r-show={j % 2 === 0}>
							{child.name}
						</li>
					</ul>
				</li>
			</ul>
		</div>
	);
}
