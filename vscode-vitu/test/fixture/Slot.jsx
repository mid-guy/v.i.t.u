import { List, Box } from './Slots';

/** @param {{ data: { id: number, label: string }[] }} props */
function Local({ data }) {
	return (
		<ul>
			<li r-for="(entry, i) in data">
				<slot item={entry} index={i}>{'fallback'}</slot>
			</li>
		</ul>
	);
}

export default function App() {
	const rows = [{ id: 1, label: 'one' }];
	return (
		<div>
			<Local data={rows} r-slot="{ item, index }">
				<b>{item.label}</b>
				<i>{index}</i>
			</Local>
			<List rows={rows} r-slot="{ item }">
				<b>{item.label}</b>
			</List>
			<Box total={3} r-slot="{ sum }">
				<b>{sum.nope}</b>
			</Box>
		</div>
	);
}
