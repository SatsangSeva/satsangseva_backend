import mongoose from "mongoose";

// Helper functions for cascading operations
export const cascadeDeleteHelpers = {
    // Delete all events created by a user
    async deleteUserEvents(userId) {
        const Event = mongoose.model("Event");
        const events = await Event.find({ user: userId });

        for (const event of events) {
            await Event.findByIdAndDelete(event._id);
        }
    },

    // Delete all bookings by a user
    async deleteUserBookings(userId) {
        const Booking = mongoose.model("Booking");
        await Booking.deleteMany({ user: userId });
    },

    // Delete all likes by a user
    async deleteUserLikes(userId) {
        const Like = mongoose.model("Like");
        await Like.deleteMany({ userId: userId });
    },

    // Delete all subscriptions involving a user
    async deleteUserSubscriptions(userId) {
        const Subscription = mongoose.model("Subscription");
        await Subscription.deleteMany({
            $or: [{ subscriber: userId }, { subscribedTo: userId }]
        });
    },

    // Delete all bookings for an event
    async deleteEventBookings(eventId) {
        const Booking = mongoose.model("Booking");
        await Booking.deleteMany({ event: eventId });
    },

    // Delete all likes for an event
    async deleteEventLikes(eventId) {
        const Like = mongoose.model("Like");
        await Like.deleteMany({ eventId: eventId });
    },

    // Remove event from user's events array
    async removeEventFromUser(eventId) {
        const User = mongoose.model("User");
        await User.updateMany(
            { events: eventId },
            { $pull: { events: eventId } }
        );
    },

    // Update like count for an event
    async updateEventLikeCount(eventId, increment = true) {
        const Event = mongoose.model("Event");
        const incValue = increment ? 1 : -1;
        await Event.findByIdAndUpdate(
            eventId,
            { $inc: { likeCount: incValue } }
        );
    },

    // Update attendee count for an event
    async updateEventAttendeeCount(eventId, count) {
        const Event = mongoose.model("Event");
        await Event.findByIdAndUpdate(
            eventId,
            { $inc: { currentNoOfAttendees: count } }
        );
    },

    // Remove booking from user and event
    async removeBookingReferences(bookingId, userId, eventId, attendeeCount) {
        const User = mongoose.model("User");
        const Event = mongoose.model("Event");

        await User.findByIdAndUpdate(
            userId,
            { $pull: { bookings: bookingId } }
        );

        await Event.findByIdAndUpdate(
            eventId,
            {
                $pull: { bookings: bookingId },
                $inc: { currentNoOfAttendees: -attendeeCount }
            }
        );
    }
};

