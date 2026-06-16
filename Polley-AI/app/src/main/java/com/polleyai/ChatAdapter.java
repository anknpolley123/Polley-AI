package com.polleyai;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import java.util.List;

/**
 * RecyclerAdapter rendering Polley AI message items supporting multimodal payloads.
 * Handles dual bubble views for User and AI roles with rendering paths for texts,
 * generated bitmaps, or speech audio components.
 */
public class ChatAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {

    private static final int VIEW_TYPE_USER = 1;
    private static final int VIEW_TYPE_AI = 2;

    private final List<ChatMessage> messageList;

    public ChatAdapter(List<ChatMessage> messageList) {
        this.messageList = messageList;
    }

    @Override
    public int getItemViewType(int position) {
        ChatMessage message = messageList.get(position);
        if (message.getSender() == ChatMessage.Sender.USER) {
            return VIEW_TYPE_USER;
        } else {
            return VIEW_TYPE_AI;
        }
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        if (viewType == VIEW_TYPE_USER) {
            View view = inflater.inflate(parent.getResources().getIdentifier("item_message_user", "layout", parent.getContext().getPackageName()), parent, false);
            return new UserMessageViewHolder(view);
        } else {
            View view = inflater.inflate(parent.getResources().getIdentifier("item_message_ai", "layout", parent.getContext().getPackageName()), parent, false);
            return new AiMessageViewHolder(view);
        }
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        ChatMessage message = messageList.get(position);
        if (holder instanceof UserMessageViewHolder) {
            ((UserMessageViewHolder) holder).bind(message);
        } else if (holder instanceof AiMessageViewHolder) {
            ((AiMessageViewHolder) holder).bind(message);
        }
    }

    @Override
    public int getItemCount() {
        return messageList.size();
    }

    static class UserMessageViewHolder extends RecyclerView.ViewHolder {
        private final TextView messageTextView;
        private final ImageView messageImageView;
        private final TextView mediaBadgeView;

        public UserMessageViewHolder(@NonNull View itemView) {
            super(itemView);
            int textViewId = itemView.getResources().getIdentifier("user_message_text", "id", itemView.getContext().getPackageName());
            int imageViewId = itemView.getResources().getIdentifier("user_message_image", "id", itemView.getContext().getPackageName());
            int badgeId = itemView.getResources().getIdentifier("user_media_badge", "id", itemView.getContext().getPackageName());
            
            messageTextView = itemView.findViewById(textViewId);
            messageImageView = itemView.findViewById(imageViewId);
            mediaBadgeView = itemView.findViewById(badgeId);
        }

        public void bind(ChatMessage message) {
            if (messageTextView != null) {
                messageTextView.setText(message.getText());
            }

            if (messageImageView != null) {
                if (message.getType() == ChatMessage.Type.IMAGE && message.getImageBitmap() != null) {
                    messageImageView.setImageBitmap(message.getImageBitmap());
                    messageImageView.setVisibility(View.VISIBLE);
                } else {
                    messageImageView.setVisibility(View.GONE);
                }
            }

            if (mediaBadgeView != null) {
                if (message.getType() == ChatMessage.Type.AUDIO) {
                    mediaBadgeView.setText("🎤 Local STT Audio");
                    mediaBadgeView.setVisibility(View.VISIBLE);
                } else if (message.getType() == ChatMessage.Type.IMAGE) {
                    mediaBadgeView.setText("🖼️ Img Prompt");
                    mediaBadgeView.setVisibility(View.VISIBLE);
                } else {
                    mediaBadgeView.setVisibility(View.GONE);
                }
            }
        }
    }

    static class AiMessageViewHolder extends RecyclerView.ViewHolder {
        private final TextView messageTextView;
        private final ImageView messageImageView;
        private final TextView mediaBadgeView;

        public AiMessageViewHolder(@NonNull View itemView) {
            super(itemView);
            int textViewId = itemView.getResources().getIdentifier("ai_message_text", "id", itemView.getContext().getPackageName());
            int imageViewId = itemView.getResources().getIdentifier("ai_message_image", "id", itemView.getContext().getPackageName());
            int badgeId = itemView.getResources().getIdentifier("ai_media_badge", "id", itemView.getContext().getPackageName());

            messageTextView = itemView.findViewById(textViewId);
            messageImageView = itemView.findViewById(imageViewId);
            mediaBadgeView = itemView.findViewById(badgeId);
        }

        public void bind(ChatMessage message) {
            if (messageTextView != null) {
                messageTextView.setText(message.getText());
            }

            if (messageImageView != null) {
                if (message.getType() == ChatMessage.Type.IMAGE && message.getImageBitmap() != null) {
                    messageImageView.setImageBitmap(message.getImageBitmap());
                    messageImageView.setVisibility(View.VISIBLE);
                } else {
                    messageImageView.setVisibility(View.GONE);
                }
            }

            if (mediaBadgeView != null) {
                if (message.getType() == ChatMessage.Type.AUDIO) {
                    mediaBadgeView.setText("🔊 Native Offline TTS Playback Active");
                    mediaBadgeView.setVisibility(View.VISIBLE);
                } else if (message.getType() == ChatMessage.Type.IMAGE) {
                    mediaBadgeView.setText("🎨 Generated via TinyDiffusion Model");
                    mediaBadgeView.setVisibility(View.VISIBLE);
                } else {
                    mediaBadgeView.setVisibility(View.GONE);
                }
            }
        }
    }
}
