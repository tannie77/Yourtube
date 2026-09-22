import { Check, FileVideo, Upload, X } from "lucide-react";
import React, { ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import { Input } from "./ui/input";
import axiosinstance from "@/lib/axiosinstance";

const VideoUploader = ({ channelId, channelName }: any) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [uploadComplete, setUploadComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;

    if (files && files.length > 0) {
      const file = files[0];

      if (!file.type.startsWith("video/")) {
        toast.error("Please upload a valid video file.");
        return;
      }

      if (file.size > 100 * 1024 * 1024) {
        toast.error("File size exceeds 100MB limit.");
        return;
      }

      setVideoFile(file);

      if (!videoTitle) {
        setVideoTitle(file.name);
      }
    }
  };

  const resetForm = () => {
    setVideoFile(null);
    setVideoTitle("");
    setIsUploading(false);
    setUploadProgress(0);
    setUploadComplete(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const cancelUpload = () => {
    if (isUploading) {
      toast.error("Your video upload has been cancelled");
    }
  };

  const handleUpload = async () => {
    if (!videoFile || !videoTitle.trim()) {
      toast.error("Please provide file and title");
      return;
    }

    const formdata = new FormData();

    formdata.append("file", videoFile);
    formdata.append("title", videoTitle);
    formdata.append("videochannel", channelName);
    formdata.append("uploader", channelId);

    try {
      setIsUploading(true);
      setUploadProgress(0);

      const res = await axiosinstance.post("/video/upload", formdata, {
        onUploadProgress: (progresEvent: any) => {
          const progress = Math.round(
            (progresEvent.loaded * 100) / progresEvent.total
          );

          setUploadProgress(progress);
        },
      });

      toast.success("Upload successfully");
      resetForm();
    } catch (error) {
      console.error("Error uploading video:", error);
      toast.error(
        "There was an error uploading your video. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">
          Upload a video
        </h2>

        <div className="space-y-4">
          {!videoFile ? (
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />

              <p className="text-lg font-medium">
                Drag and drop video files to upload
              </p>

              <p className="text-sm text-gray-500 mt-1">
                or click to select files
              </p>

              <p className="text-xs text-gray-400 mt-4">
                MP4, WebM, MOV or AVI • Up to 100MB
              </p>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="video/*"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div>
              <div>
                <div>
                  <FileVideo />
                </div>

                <div>
                  <p>{videoFile.name}</p>
                  <p>
                    {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>

                {isUploading && (
                  <Button onClick={cancelUpload}>
                    <X />
                  </Button>
                )}

                {uploadComplete && (
                  <div>
                    <Check />
                  </div>
                )}
              </div>

              <div>
                <div>
                  <Label htmlFor="title">Title</Label>

                  <Input
                    id="title"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                  />
                </div>
              </div>

              {isUploading && (
                <div>
                  <div>
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>

                  <Progress value={uploadProgress} />
                </div>
              )}

              <div>
                {!uploadComplete && (
                  <>
                    <Button
                      onClick={cancelUpload}
                      disabled={uploadComplete}
                    >
                      Cancel
                    </Button>

                    <Button>
                      onClick={handleUpload}
                      disabled={
                        isUploading ||
                        !videoTitle.trim() ||
                        uploadComplete
                      }
                      {isUploading ? "Uploading..." : "Upload"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoUploader;
