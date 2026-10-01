export type FeedSort = "all" | "recent" | "popular";

const options: { id: FeedSort; label: string }[] = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recently added" },
  { id: "popular", label: "Most viewed" },
];

export default function CategoryTabs({ value, onChange }: { value: FeedSort; onChange: (value: FeedSort) => void }) {
  return (
    <div className="yt-chip-row" role="group" aria-label="Sort videos">
      {options.map((option) => (
        <button key={option.id} type="button" className="yt-chip" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>
      ))}
    </div>
  );
}
