var trackPoints = []; 
var polyline = null;
var markers = [];
var apiKey = API_KEY;

function create_Waypoints() {
	map.on('click', function(e) {
		var point = {
			lat: e.latlng.lat,
			lng: e.latlng.lng
		};
		trackPoints.push(point);
		var marker = L.marker([point.lat, point.lng]).addTo(map);	
		markers.push(marker);
		if (trackPoints.length >= 2) {
			updateRoute();
		}
	});
}

function undoPoint() {
	if (trackPoints.length === 0) {
		alert("No waypoints to undo!");
		return;
	}

	trackPoints.pop();

	var lastMarker = markers.pop();
	if (lastMarker) {
		map.removeLayer(lastMarker);
	}
	if (trackPoints.length >= 2) {
		updateRoute();
	} else {
		if (polyline) {
			map.removeLayer(polyline);
			polyline = null;
		}
	}
}

function clearTrack() {
	trackPoints = [];
	
	markers.forEach(marker => map.removeLayer(marker));
	markers = [];

	if (polyline) {
		map.removeLayer(polyline);
		polyline = null;
	}
}

function downloadGPX() {
	if (trackPoints.length === 0) {
		alert("No waypoints to download! Click on the map to add waypoints.");
		return;
	}
	var trackName = document.getElementById('trackName').value || 'My Hike'; 
	// Build GPX XML
	var gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
	gpx += '<gpx version="1.1" creator="OpenCairn" xmlns="http://www.topografix.com/GPX/1/1">\n';
	gpx += '  <trk>\n';
	gpx += '    <name>' + trackName + '</name>\n';
	gpx += '    <trkseg>\n';

	trackPoints.forEach(function(point) {
		gpx += '      <trkpt lat="' + point.lat + '" lon="' + point.lng + '">\n';
		gpx += '      </trkpt>\n';
	});

	gpx += '    </trkseg>\n';
	gpx += '  </trk>\n';
	gpx += '</gpx>';

	// Download file 
	var blob = new Blob([gpx], {type: 'application/gpx+xml'});
	var url = URL.createObjectURL(blob);
	var link = document.createElement('a');
	link.href = url;
	link.download = trackName + '.gpx';
	link.click();
	URL.revokeObjectURL(url);

	console.log("GPX downloaded!");
}

//Try and route user using the open route service API 
function updateRoute() {
	if (polyline) {
		map.removeLayer(polyline);
	}

	var coordinates = trackPoints.map(p => [p.lng, p.lat]); // ORS wants [lng, lat]
	var apiKey = API_KEY;
	var url = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

	fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': apiKey
		},
		body: JSON.stringify({
			coordinates: coordinates
		})
	})
		.then(response => response.json())
		.then(data => {
			polyline = L.geoJSON(data, {
				style: {color: 'red', weight: 4}
			}).addTo(map);
		})
		.catch(error => {
			console.log("ORS failed, using straight lines:", error);
			drawStraightLines();
		});
}

//Fallback to just draw a straight line
function drawStraightLines() {
	var latlngs = trackPoints.map(p => [p.lat, p.lng]);
	polyline = L.polyline(latlngs, {color: 'blue', weight: 3}).addTo(map);
}
