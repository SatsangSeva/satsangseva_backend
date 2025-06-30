import axios from 'axios';

export const extractCoordinatesFromLink = async (shortUrl) => {
  try {
    console.log('Original link:', shortUrl);

    // Follow redirects to get the final long URL
    const response = await axios.get(shortUrl, {
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const finalUrl = response.request.res.responseUrl;

    const url = new URL(finalUrl);
    const pathSegments = url.pathname.split('/');

    let lat = null;
    let lng = null;

    // ✅ Case 1: /dir/lat,lng/...
    const dirIndex = pathSegments.indexOf('dir');
    if (dirIndex !== -1 && dirIndex + 1 < pathSegments.length) {
      const coordsString = pathSegments[dirIndex + 1].split(',');
      if (coordsString.length >= 2) {
        lat = parseFloat(coordsString[0]);
        lng = parseFloat(coordsString[1]);
      }
    }

    // ✅ Case 2: /@lat,lng,...
    if ((lat === null || lng === null) && url.pathname.includes('@')) {
      const atSplit = url.pathname.split('@');
      if (atSplit.length >= 2) {
        const coordsString = atSplit[1].split(',');
        if (coordsString.length >= 2) {
          lat = parseFloat(coordsString[0]);
          lng = parseFloat(coordsString[1]);
        }
      }
    }

    // ✅ Case 3: Extract from !3dLAT!4dLNG pattern
    if ((lat === null || lng === null)) {
      const regex = /!3d([-.\d]+)!4d([-.\d]+)/;
      const match = finalUrl.match(regex);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
      }
    }

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    } else {
      console.log('Coordinates not found in the URL.');
      return null;
    }
  } catch (err) {
    console.error('Error extracting coordinates:', err.message);
    return null;
  }
};



export const calculateDistanceInKm = async (lat1, lon1, lat2, lon2) => {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${process.env.GMAP_KEY}`;
  const res = await axios.get(url);
  const data = res.data;

  if (data.rows[0].elements[0].status === 'OK') {
    const distanceValue = data.rows[0].elements[0].distance.value; // in meters
    const distanceKm = distanceValue / 1000;
    return distanceKm;
  } else {
    console.error('❌ Google API Error:', data.rows[0].elements[0].status);
    return null;
  }
};




