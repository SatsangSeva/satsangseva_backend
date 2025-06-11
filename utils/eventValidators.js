export function validateEventInputs(inputs) {
  const errors = {};

  if (
    !inputs.eventName ||
    typeof inputs.eventName !== "string" ||
    inputs.eventName.trim() === ""
  ) {
    errors.eventName = "Event name is required and must be a non-empty string";
  }

  if (
    !inputs.eventCategory ||
    !Array.isArray(inputs.eventCategory) ||
    inputs.eventCategory.length === 0 ||
    inputs.eventCategory.some(
      (cat) => typeof cat !== "string" || cat.trim() === ""
    )
  ) {
    errors.eventCategory =
      "Event category must be a non-empty array of strings";
  }

  if (
    !inputs.eventDesc ||
    typeof inputs.eventDesc !== "string" ||
    inputs.eventDesc.trim() === ""
  ) {
    errors.eventDesc =
      "Event Description is required and must be a non-empty string";
  }

  // Modified validation for eventPrice - checking if it's a paid event
  if (!inputs.eventPrice || typeof inputs.eventPrice !== "string" || inputs.eventPrice.trim() === "") {
    errors.eventPrice = "Event Price is required and must be a non-empty string";
  } else {
    // If eventPrice is not "0" or "free", validate that it's a valid number
    const isPaid = !["0", "free", "Free", "FREE"].includes(inputs.eventPrice.trim());
    if (isPaid && (isNaN(parseFloat(inputs.eventPrice)) || parseFloat(inputs.eventPrice) <= 0)) {
      errors.eventPrice = "Event Price must be a valid positive number for paid events";
    }
  }
  if (
    !inputs.eventLang ||
    typeof inputs.eventLang !== "string" ||
    inputs.eventLang.trim() === ""
  ) {
    errors.eventLang =
      "Event language is required and must be a non-empty string";
  }

  // if (!inputs.noOfAttendees || typeof inputs.noOfAttendees !== "number") {
  //   errors.noOfAttendees =
  //     "Number of attendees is required and must be a positive integer";
  // }

  if (
    !inputs.artistOrOratorName ||
    typeof inputs.artistOrOratorName !== "string" ||
    inputs.artistOrOratorName.trim() === ""
  ) {
    errors.artistOrOratorName =
      "artistOrOratorName name is required and must be a non-empty string";
  }

  if (
    !inputs.organizerName ||
    typeof inputs.organizerName !== "string" ||
    inputs.organizerName.trim() === ""
  ) {
    errors.organizerName = "organizer name is required and must be a non-empty string";
  }

  if (
    !inputs.organizerWhatsapp ||
    typeof inputs.organizerWhatsapp !== "string" ||
    inputs.organizerWhatsapp.length !== 10
  ) {
    errors.organizerWhatsapp = "organizer WhatsApp number must be of 10 Digits";
  }

  // Modified validation for bookingLink - keeping it optional but validating if provided
  // if (inputs.bookingLink && inputs.bookingLink !== undefined && inputs.bookingLink !== null) {
  //   if (typeof inputs.bookingLink !== "string" || !/^(https?:\/\/[^\s]+|na)$/i.test(inputs.bookingLink.trim())) {
  //     errors.bookingLink = "Booking link must be a valid URL";
  //   }
  // }
  if (
    !inputs.locationLink ||
    typeof inputs.locationLink !== "string" ||
    inputs.locationLink.trim() === ""
  ) {
    errors.locationLink = "Location is required and must be a non-empty string";
  }

  // Updated address validation (instead of a single eventAddress field)
  if (!inputs.address || typeof inputs.address !== "object") {
    errors.address = "Address is required and must be an object";
  } else {
    const addressErrors = {};
    if (
      !inputs.address.address ||
      typeof inputs.address.address !== "string" ||
      inputs.address.address.trim() === ""
    ) {
      addressErrors.address = "Primary address is required and must be a non-empty string";
    }
    if (
      !inputs.address.city ||
      typeof inputs.address.city !== "string" ||
      inputs.address.city.trim() === ""
    ) {
      addressErrors.city = "City is required and must be a non-empty string";
    }
    if (
      !inputs.address.state ||
      typeof inputs.address.state !== "string" ||
      inputs.address.state.trim() === ""
    ) {
      addressErrors.state = "State is required and must be a non-empty string";
    }
    if (
      !inputs.address.postalCode ||
      typeof inputs.address.postalCode !== "string" ||
      inputs.address.postalCode.trim() === ""
    ) {
      addressErrors.postalCode = "Postal code is required and must be a non-empty string";
    }
    if (
      !inputs.address.country ||
      typeof inputs.address.country !== "string" ||
      inputs.address.country.trim() === ""
    ) {
      addressErrors.country = "Country is required and must be a non-empty string";
    }
    // Optional: Validate address2 and landmark if provided
    if (inputs.address.address2 && typeof inputs.address.address2 !== "string") {
      addressErrors.address2 = "Address2 must be a string";
    }
    if (inputs.address.landmark && typeof inputs.address.landmark !== "string") {
      addressErrors.landmark = "Landmark must be a string";
    }
    if (Object.keys(addressErrors).length > 0) {
      errors.address = addressErrors;
    }
  }

  if (
    !inputs.startDate ||
    typeof inputs.startDate !== "string" ||
    isNaN(Date.parse(inputs.startDate))
  ) {
    errors.startDate = "Start date is required and must be a valid date";
  }

  if (
    !inputs.endDate ||
    typeof inputs.endDate !== "string" ||
    isNaN(Date.parse(inputs.endDate))
  ) {
    errors.endDate = "End date is required and must be a valid date";
  }

  if (
    !inputs.startTime ||
    typeof inputs.startTime !== "string" ||
    inputs.startTime.trim() === ""
  ) {
    errors.startTime = "Start time is required and must be a valid time";
  }

  // Validate endTime
  if (
    !inputs.endTime ||
    typeof inputs.endTime !== "string" ||
    inputs.endTime.trim() === ""
  ) {
    errors.endTime = "End time is required and must be a valid time";
  }

  if (!inputs.eventAgenda || !Array.isArray(inputs.eventAgenda)) {
    errors.eventAgenda = "Event agenda must be an array";
  } else if (inputs.eventAgenda.length === 0) {
    errors.eventAgenda = "At least one agenda item is required";
  } else {
    const agendaErrors = [];
    inputs.eventAgenda.forEach((item, index) => {
      const itemErrors = {};

      if (!item.subEvent || !Number.isInteger(item.subEvent) || item.subEvent < 1) {
        itemErrors.subEvent = "sub Event must be a positive integer";
      }

      if (
        !item.title ||
        typeof item.title !== "string" ||
        item.title.trim() === ""
      ) {
        itemErrors.title = "Title is required";
      }

      if (
        !item.description ||
        typeof item.description !== "string" ||
        item.description.trim() === ""
      ) {
        itemErrors.description = "Description is required";
      }

      if (Object.keys(itemErrors).length > 0) {
        agendaErrors[index] = itemErrors;
      }
    });

    if (agendaErrors.length > 0) {
      errors.eventAgenda = agendaErrors;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
