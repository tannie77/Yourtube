import history from "../Modals/history.js";

export const handlehistory = async (req, res) => {
  return res.status(410).json({ message: "History is recorded automatically when protected playback starts." });
};
export const handleview = async (req, res) => {
  return res.status(410).json({ message: "Manual view changes are no longer supported." });
};
export const getallhistoryVideo = async (req, res) => {
  const { userId } = req.params;
  if (String(req.user._id) !== userId) return res.status(403).json({ message: "This history belongs to another account." });
  try {
    const historyvideo = await history
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();
    return res.status(200).json(historyvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
