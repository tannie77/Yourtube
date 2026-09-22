export const login = async (req, res) => {
  const { email, name, image } = req.body;
  try {
    const existinguser = await users.findOne({ email });
    if (!existinguser) {
      try {
        const newuser = await users.create({ email, name, image });
        res.status(200).json({ result: newuser });
      } catch (error) {
        res.status(500).json({ message: "something went wrong" });
        return
      }
    }else{
      res.status(200).json({ result: newuser });
    }

  } catch (error) {}
  res.status(500).json({ message: "something went wrong" });
  return;
};
export const updateprofile = async (req, res) => {
    const { id: _id } = req.params;
    const { channelname, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(500).json({ message: "User unavailable..." });
    }

    try {
        const updatedata = await users.findByIdAndUpdate(
            _id,
            {
                $set: {
                    channelname: channelname,
                    description: description,
                },
            },
            { new: true }
        );

        return res.status(201).json(updatedata);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};
