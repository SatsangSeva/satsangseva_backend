export const extractCoordinatesFromLink = (link) => {
  try {
    const regex1 = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const regex2 = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;

    const match1 = link.match(regex1);
    const match2 = link.match(regex2);

    if (match1) {
      return {
        lat: parseFloat(match1[1]),
        lng: parseFloat(match1[2]),
      };
    } else if (match2) {
      return {
        lat: parseFloat(match2[1]),
        lng: parseFloat(match2[2]),
      };
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
};

export const calculateDistanceInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371.0088; // More accurate earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance; // Do not round here
};

const deg2rad = (deg) => deg * (Math.PI / 180);



