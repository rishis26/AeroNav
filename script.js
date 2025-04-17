document.addEventListener('DOMContentLoaded', () => {
    let map;
    let markers = [];
    let flightPaths = [];
    let selectedFlight = null;
    let searchInput;
    let isLoading = false;
    let currentBounds = null;

    // Initialize sidebar toggle
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    toggleBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleBtn.querySelector('i').classList.toggle('fa-chevron-right');
        toggleBtn.querySelector('i').classList.toggle('fa-chevron-left');
    });

    // Function to fetch flight data
    async function fetchFlightData() {
        if (isLoading) return [];
        
        try {
            isLoading = true;
            const flightList = document.getElementById('flightList');
            if (flightList) {
                flightList.classList.add('loading');
            }

            // Use a CORS proxy to fetch flight data
            const corsProxy = 'https://cors-anywhere.herokuapp.com/';
            const openskyApi = 'https://opensky-network.org/api/states/all';
            
            const response = await fetch(corsProxy + openskyApi, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Origin': window.location.origin
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data && data.states && Array.isArray(data.states)) {
                console.log(`Received ${data.states.length} flights`);
                return data.states
                    .filter(flight => flight[5] && flight[6] && flight[1]) // Has position and callsign
                    .map(flight => ({
                        icao24: flight[0],
                        callsign: flight[1].trim(),
                        country: flight[2] || 'Unknown',
                        position: {
                            lat: flight[6],
                            lng: flight[5]
                        },
                        altitude: Math.round((flight[7] || 0) * 3.28084), // Convert meters to feet
                        speed: Math.round((flight[9] || 0) * 1.944), // Convert m/s to knots
                        heading: flight[10] || 0,
                        lastUpdate: flight[4],
                        onGround: flight[8],
                        // Add departure and arrival if available
                        departure: flight[11] || 'N/A',
                        arrival: flight[12] || 'N/A',
                        airline: getAirlineFromCallsign(flight[1]) // Get airline from full callsign
                    }))
                    .filter(flight => !flight.onGround); // Only show airborne aircraft
            }

            // If no data from API, fall back to mock data for testing
            console.log('No flight data received, using mock data');
            return generateMockFlights();

        } catch (error) {
            console.error('Error fetching flight data:', error);
            console.log('Falling back to mock data');
            return generateMockFlights();
        } finally {
            isLoading = false;
            const flightList = document.getElementById('flightList');
            if (flightList) {
                flightList.classList.remove('loading');
            }
        }
    }

    // Helper function to get airline from callsign
    function getAirlineFromCallsign(callsign) {
        const commonAirlines = {
            // North America
            'AAL': 'American Airlines',
            'UAL': 'United Airlines',
            'DAL': 'Delta Air Lines',
            'SWA': 'Southwest Airlines',
            'ACA': 'Air Canada',
            // Europe
            'BAW': 'British Airways',
            'DLH': 'Lufthansa',
            'AFR': 'Air France',
            'KLM': 'KLM Royal Dutch',
            // Asia
            'AI': 'Air India',
            'CCA': 'Air China',
            'CES': 'China Eastern',
            'JAL': 'Japan Airlines',
            'SIA': 'Singapore Airlines',
            // Middle East
            'UAE': 'Emirates',
            'ETH': 'Etihad Airways',
            'QTR': 'Qatar Airways',
            // Oceania
            'QFA': 'Qantas',
            // Indian Airlines
            'IX': 'Air India Express',
            '6E': 'IndiGo',
            'SG': 'SpiceJet',
            'UK': 'Vistara',
            'G8': 'Go First',
            'I5': 'Air Asia India'
        };
        
        // Try to match the first 3 letters or 2 letters of the callsign
        const code3 = callsign.slice(0, 3);
        const code2 = callsign.slice(0, 2);
        return commonAirlines[code3] || commonAirlines[code2] || callsign;
    }

    // Generate mock flight data for demonstration
    function generateMockFlights() {
        const airports = {
            'DEL': { lat: 28.5665, lng: 77.1031, name: 'Indira Gandhi International Airport, Delhi' },
            'BOM': { lat: 19.0896, lng: 72.8656, name: 'Chhatrapati Shivaji International Airport, Mumbai' },
            'MAA': { lat: 12.9941, lng: 80.1709, name: 'Chennai International Airport' },
            'BLR': { lat: 13.1986, lng: 77.7066, name: 'Kempegowda International Airport, Bangalore' },
            'CCU': { lat: 22.6520, lng: 88.4463, name: 'Netaji Subhas Chandra Bose International Airport, Kolkata' },
            'HYD': { lat: 17.2403, lng: 78.4294, name: 'Rajiv Gandhi International Airport, Hyderabad' },
            'AMD': { lat: 23.0225, lng: 72.5714, name: 'Sardar Vallabhbhai Patel International Airport, Ahmedabad' },
            'COK': { lat: 10.1520, lng: 76.4012, name: 'Cochin International Airport' },
            'GOI': { lat: 15.3808, lng: 73.8314, name: 'Dabolim Airport, Goa' },
            'PNQ': { lat: 18.5793, lng: 73.9089, name: 'Pune Airport' }
        };

        const airlines = {
            'AI': { name: 'Air India', routes: ['DEL-BOM', 'BOM-MAA', 'DEL-CCU', 'BLR-DEL', 'HYD-DEL'] },
            'UK': { name: 'Vistara', routes: ['DEL-BOM', 'BLR-DEL', 'HYD-BOM', 'CCU-DEL', 'GOI-DEL'] },
            '6E': { name: 'IndiGo', routes: ['DEL-BOM', 'BLR-CCU', 'HYD-MAA', 'PNQ-DEL', 'COK-BOM'] },
            'SG': { name: 'SpiceJet', routes: ['DEL-AMD', 'BOM-COK', 'MAA-CCU', 'BLR-GOI', 'HYD-PNQ'] }
        };

        const mockFlights = [];

        // Generate flights for each airline
        Object.entries(airlines).forEach(([airlineCode, airline]) => {
            airline.routes.forEach(route => {
                const [fromAirport, toAirport] = route.split('-');
                const from = airports[fromAirport];
                const to = airports[toAirport];
                
                // Calculate a position between airports
                const progress = Math.random();
                const lat = from.lat + (to.lat - from.lat) * progress;
                const lng = from.lng + (to.lng - from.lng) * progress;
                
                // Calculate heading
                const heading = Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180 / Math.PI;

                // Create flight number
                const flightNumber = Math.floor(Math.random() * 900) + 100;

                mockFlights.push({
                    icao24: `${airlineCode}${flightNumber}`,
                    callsign: `${airlineCode}${flightNumber}`,
                    country: 'India',
                    airline: airline.name,
                    position: { lat, lng },
                    altitude: 25000 + Math.random() * 15000, // Between 25,000 and 40,000 feet
                    speed: 400 + Math.random() * 100, // Between 400 and 500 knots
                    heading: heading,
                    lastUpdate: Date.now() / 1000,
                    onGround: false,
                    departure: `${fromAirport} (${airports[fromAirport].name})`,
                    arrival: `${toAirport} (${airports[toAirport].name})`,
                    status: 'active'
                });
            });
        });

        return mockFlights;
    }

    // Function to initialize the map
    function initMap() {
        console.log('Initializing map...');
        
        // Create the map centered on India
        map = L.map('map', {
            center: [20.5937, 78.9629],
            zoom: 5,
            minZoom: 3,
            zoomControl: true,
            attributionControl: true
        });

        // Add dark theme map tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        // Initialize search
        searchInput = document.querySelector('#search');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }

        // Initial flight update
        updateFlights();
        
        // Regular updates every 30 seconds
        setInterval(updateFlights, 30000);
    }

    // Create plane icon
    function createPlaneIcon(heading, altitude) {
        const color = getAltitudeColor(altitude);
        return L.divIcon({
            className: 'flight-icon',
            html: `<div style="transform: rotate(${heading}deg); color: ${color};">✈️</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
    }

    // Get color based on altitude
    function getAltitudeColor(altitude) {
        if (altitude > 35000) return '#0000ff';      // Blue
        if (altitude > 30000) return '#00ff00';      // Green
        if (altitude > 20000) return '#ffff00';      // Yellow
        if (altitude > 10000) return '#ff7f00';      // Orange
        return '#ff0000';                            // Red
    }

    // Handle search input
    function handleSearch() {
        const searchTerm = searchInput.value.toLowerCase();
        const flightCards = document.querySelectorAll('.flight-card');
        
        flightCards.forEach(card => {
            const flightId = card.getAttribute('data-flight-id').toLowerCase();
            const country = card.getAttribute('data-country').toLowerCase();
            
            if (flightId.includes(searchTerm) || country.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Center map on user's location
    function centerMap() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    map.setView(userLocation, 12); // Closer zoom for local view
                    
                    // Optional: Add a marker for user's location
                    L.marker(userLocation).addTo(map)
                        .bindPopup("Your Location")
                        .openPopup();
                },
                (error) => {
                    console.error("Error getting location:", error);
                    alert("Unable to get your location. Please check your browser settings and try again.");
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        } else {
            alert("Geolocation is not supported by your browser.");
        }
    }

    // Add info window
    function createInfoWindow(flight) {
        return L.popup({
            content: `
                <div style="padding: 15px; min-width: 250px; font-family: Arial, sans-serif;">
                    <h3 style="margin-bottom: 10px; color: #1a73e8; font-size: 18px; border-bottom: 2px solid #1a73e8; padding-bottom: 5px;">${flight.callsign}</h3>
                    <div style="margin-bottom: 15px; font-size: 16px; color: #333;">
                        <strong>${flight.airline || 'Airline'}</strong>
                    </div>
                    <div style="margin-bottom: 10px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #1a73e8;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #444;">From: <strong style="color: #1a73e8">${flight.departure}</strong></span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #444;">To: <strong style="color: #1a73e8">${flight.arrival}</strong></span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                        <div style="background: #e8f0fe; padding: 8px; border-radius: 6px;">
                            <i class="fas fa-arrow-up" style="color: #1a73e8;"></i>
                            <strong style="color: #1a73e8;">${flight.altitude.toLocaleString()}</strong>
                            <span style="color: #666;">ft</span>
                        </div>
                        <div style="background: #e8f0fe; padding: 8px; border-radius: 6px;">
                            <i class="fas fa-tachometer-alt" style="color: #1a73e8;"></i>
                            <strong style="color: #1a73e8;">${Math.round(flight.speed)}</strong>
                            <span style="color: #666;">kts</span>
                        </div>
                        <div style="background: #e8f0fe; padding: 8px; border-radius: 6px;">
                            <i class="fas fa-compass" style="color: #1a73e8;"></i>
                            <strong style="color: #1a73e8;">${Math.round(flight.heading)}°</strong>
                        </div>
                        <div style="background: #e8f0fe; padding: 8px; border-radius: 6px;">
                            <i class="fas fa-clock" style="color: #1a73e8;"></i>
                            <strong style="color: #1a73e8;">${new Date(flight.lastUpdate * 1000).toLocaleTimeString()}</strong>
                        </div>
                    </div>
                </div>
            `,
            className: 'flight-popup'
        });
    }

    // Update flights
    async function updateFlights() {
        if (isLoading) return;
        
        console.log('Updating flights...');
        
        // Clear existing markers
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                layer.remove();
            }
        });
        markers = [];

        // Fetch new flight data
        const flights = await fetchFlightData();
        
        if (flights.length === 0) {
            const flightList = document.getElementById('flightList');
            if (flightList) {
                flightList.innerHTML = '<div class="no-flights">No flights available. Please check your internet connection or try again later.</div>';
            }
            return;
        }

        // Update each flight
        flights.forEach(flight => {
            // Create marker
            const marker = L.marker(flight.position, {
                icon: createPlaneIcon(flight.heading, flight.altitude)
            }).addTo(map);

            // Add info window
            const infoWindow = createInfoWindow(flight);

            marker.bindPopup(infoWindow);

            markers.push(marker);
        });

        // Update flight list
        updateFlightList(flights);
        
        // Log status
        console.log(`Updated ${flights.length} flights`);
    }

    function updateFlightList(flights) {
        const flightList = document.getElementById('flightList');
        if (!flightList) return;

        const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
        
        // Sort flights to prioritize Indian flights
        const sortedFlights = flights.sort((a, b) => {
            if (a.country === 'India' && b.country !== 'India') return -1;
            if (a.country !== 'India' && b.country === 'India') return 1;
            return 0;
        });

        const filteredFlights = sortedFlights
            .filter(flight => 
                flight.callsign.toLowerCase().includes(searchQuery) ||
                flight.country.toLowerCase().includes(searchQuery) ||
                (flight.departure && flight.departure.toLowerCase().includes(searchQuery)) ||
                (flight.arrival && flight.arrival.toLowerCase().includes(searchQuery))
            )
            .slice(0, 100); // Limit to 100 flights in the list for performance

        const flightCards = filteredFlights.map(flight => `
            <div class="flight-card ${flight.country === 'India' ? 'indian-flight' : ''}" 
                 onclick="centerOnFlight(${flight.position.lat}, ${flight.position.lng})">
                <div class="flight-header">
                    <strong>${flight.callsign}</strong>
                    <span>${flight.country}</span>
                </div>
                <div class="flight-route">
                    <span>${flight.departure || 'N/A'}</span>
                    <i class="fas fa-arrow-right"></i>
                    <span>${flight.arrival || 'N/A'}</span>
                </div>
                <div class="flight-details">
                    <span><i class="fas fa-arrow-up"></i> ${flight.altitude.toLocaleString()} ft</span>
                    <span><i class="fas fa-tachometer-alt"></i> ${Math.round(flight.speed)} kts</span>
                </div>
            </div>
        `).join('');

        flightList.innerHTML = flightCards || '<div class="no-flights">No flights match your search</div>';
    }

    // Focus on a specific flight
    function focusOnFlight(callsign) {
        const marker = markers.find(m => m.getPopup().getContent().includes(callsign));
        if (marker) {
            map.setView(marker.getLatLng(), 8);
        }
    }

    // Make functions available globally
    window.initMap = initMap;
    window.centerMap = centerMap;
    window.focusOnFlight = focusOnFlight;
    window.centerOnFlight = function(lat, lng) {
        map.setView([lat, lng], 8);
    };
    window.toggleTheme = function() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        
        if (map) {
            // Remove existing tiles and add new tiles based on the new theme
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    map.removeLayer(layer);
                }
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (newTheme === 'dark' ? 'dark_all/' : 'light_all/') + '{z}/{x}/{y}{r}.png', {
                attribution: '©OpenStreetMap, ©CartoDB',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);
        }
    };

    // Initialize the map
    initMap();
}); 