//Get users location on page load 

window.onload = function() {
	initMap(43.07575056810023, -87.88531759191766);

	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(
			function(position) {
				var lat = position.coords.latitude;
				var lng = position.coords.longitude;
				console.log("Got location:", lat, lng); 	
				map.flyTo([lat, lng], 13);

			},
			function(error) {
				console.log("Location error:", error);
			}
		);
	}
};

function initMap(lat, lng) {
	map = L.map('map').setView([lat, lng], 13);
	L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '© OpenStreetMap contributors'
	}).addTo(map);
	create_Waypoints();
}
