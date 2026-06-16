package com.polleyai;

import android.graphics.Bitmap;

/**
 * Data model representing an individual multimodal chat message in the Polley AI Thread.
 */
public class ChatMessage {
    public enum Sender {
        USER,
        AI
    }

    public enum Type {
        TEXT,
        IMAGE,
        AUDIO
    }

    private final String text;
    private final Sender sender;
    private final Type type;
    private final Bitmap imageBitmap;
    private final long timestamp;

    public ChatMessage(String text, Sender sender) {
        this(text, sender, Type.TEXT, null);
    }

    public ChatMessage(String text, Sender sender, Type type, Bitmap imageBitmap) {
        this.text = text;
        this.sender = sender;
        this.type = type;
        this.imageBitmap = imageBitmap;
        this.timestamp = System.currentTimeMillis();
    }

    public String getText() {
        return text;
    }

    public Sender getSender() {
        return sender;
    }

    public Type getType() {
        return type;
    }

    public Bitmap getImageBitmap() {
        return imageBitmap;
    }

    public long getTimestamp() {
        return timestamp;
    }
}
