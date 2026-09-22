import Like from "../Modals/like.js";
import Video from "../Modals/video.js";

export const handlelike = async (req, res) => {
  const { userId, reaction = "like" } = req.body;
  const { videoId } = req.params;

  if (!userId || !["like", "dislike"].includes(reaction)) {
    return res.status(400).json({ message: "A user and valid reaction are required." });
  }

  try {
    const existingReaction = await Like.findOne({ viewer: userId, videoid: videoId });
    const counter = reaction === "like" ? "Like" : "Dislike";

    if (existingReaction?.reaction === reaction) {
      await Like.findByIdAndDelete(existingReaction._id);
      const video = await Video.findByIdAndUpdate(videoId, { $inc: { [counter]: -1 } }, { new: true });
      return res.status(200).json({ active: false, reaction, likes: video?.Like ?? 0, dislikes: video?.Dislike ?? 0 });
    }

    const updates = { [counter]: 1 };
    if (existingReaction) {
      const previousCounter = existingReaction.reaction === "like" ? "Like" : "Dislike";
      updates[previousCounter] = -1;
      existingReaction.reaction = reaction;
      await existingReaction.save();
    } else {
      await Like.create({ viewer: userId, videoid: videoId, reaction });
    }

    const video = await Video.findByIdAndUpdate(videoId, { $inc: updates }, { new: true });
    return res.status(200).json({ active: true, reaction, likes: video?.Like ?? 0, dislikes: video?.Dislike ?? 0 });
  } catch (error) {
    console.error("Reaction error:", error);
    return res.status(500).json({ message: "Could not save reaction." });
  }
};

export const getallLikedVideo = async (req, res) => {
  const { userId } = req.params;
  try {
    const likevideo = await Like
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(likevideo);
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
