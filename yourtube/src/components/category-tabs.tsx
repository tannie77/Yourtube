export const feedTopics = ["All", "Music", "Gaming", "Movies", "News", "Sports", "Technology", "Comedy", "Education", "Science", "Travel", "Food", "Fashion"] as const;
export type FeedTopic = typeof feedTopics[number];

export default function CategoryTabs({ value, onChange }: { value: FeedTopic; onChange: (value: FeedTopic) => void }) {
  return (
    <div className="yt-chip-row" role="group" aria-label="Video topics">
      {feedTopics.map((topic) => (
        <button key={topic} type="button" className="yt-chip" aria-pressed={value === topic} onClick={() => onChange(topic)}>{topic}</button>
      ))}
    </div>
  );
}
