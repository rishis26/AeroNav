document.addEventListener('DOMContentLoaded', () => {
    let map;
    let markers = [];
    let flightPaths = [];
    let selectedFlight = null;
    let searchInput;
    let isLoading = false;
    let currentBounds = null;
    let allFlights = []; // Store all flights for filtering

    // Initialize sidebar toggle
    const toggleBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    toggleBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleBtn.querySelector('i').classList.toggle('fa-chevron-right');
        toggleBtn.querySelector('i').classList.toggle('fa-chevron-left');
    });

    // Initialize altitude filter event listeners
    function initAltitudeFilters() {
        const filterInputs = document.querySelectorAll('.altitude-filters input[type="checkbox"]');
        filterInputs.forEach(input => {
            input.addEventListener('change', updateFlightFilters);
        });
    }

    // Get selected altitude ranges
    function getSelectedAltitudeRanges() {
        const checkboxes = document.querySelectorAll('.altitude-filters input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(checkbox => checkbox.value);
    }

    // Check if flight altitude is within selected ranges
    function isFlightInSelectedRanges(flight, selectedRanges) {
        const altitude = flight.altitude;
        return selectedRanges.some(range => {
            if (range === '40000+') {
                return altitude >= 40000;
            }
            const [min, max] = range.split('-').map(Number);
            return altitude >= min && altitude < max;
        });
    }

    // Update displayed flights based on filters
    function updateFlightFilters() {
        const selectedRanges = getSelectedAltitudeRanges();
        
        // Clear existing markers
        markers.forEach(marker => marker.remove());
        markers = [];

        // Filter and display flights
        const visibleFlights = allFlights.filter(flight => 
            isFlightInSelectedRanges(flight, selectedRanges)
        );

        // Update markers
        visibleFlights.forEach(flight => {
            const marker = L.marker(flight.position, {
                icon: createPlaneIcon(flight.heading, flight.altitude)
            }).addTo(map);

            const infoWindow = createInfoWindow(flight);
            marker.bindPopup(infoWindow);
            markers.push(marker);
        });

        // Update flight list
        updateFlightList(visibleFlights);
    }

    // Function to fetch flight data
    async function fetchFlightData() {
        if (isLoading) return;
        
        try {
            isLoading = true;
            const flightList = document.getElementById('flightList');
            if (flightList) {
                flightList.classList.add('loading');
                flightList.innerHTML = '<div class="loading-message">Fetching flights...</div>';
            }

            const apiKey = 'b1c662432fbde14088cf3fb96b2c12c6';
            
            // Major Indian airports IATA codes
            const indianAirports = [
                'DEL', // Delhi
                'BOM', // Mumbai
                'MAA', // Chennai
                'BLR', // Bangalore
                'HYD', // Hyderabad
                'CCU', // Kolkata
                'COK', // Kochi
                'PNQ', // Pune
                'AMD', // Ahmedabad
                'GOI'  // Goa
            ];

            // Indian airlines IATA codes
            const indianAirlines = [
                'AI',  // Air India
                'IX',  // Air India Express
                '6E',  // IndiGo
                'SG',  // SpiceJet
                'UK',  // Vistara
                'G8',  // Go First
                'I5'   // AirAsia India
            ];

            // Create URL for Indian flights
            const flightsUrl = `https://api.aviationstack.com/v1/flights?access_key=${apiKey}&limit=100&arr_iata=${indianAirports.join(',')}&dep_iata=${indianAirports.join(',')}&airline_iata=${indianAirlines.join(',')}`;
            
            try {
                console.log('Fetching Indian flights...'); // Debug log
                const response = await fetch(flightsUrl);
                const data = await response.json();
                
                console.log('API Response:', data); // Debug log
                
                if (data.error) {
                    console.error('API Error:', data.error);
                    if (data.error.code === 104) {
                        console.log('Monthly API limit reached, using mock data');
                        return generateMockFlights();
                    }
                    throw new Error(data.error.message || 'API Error');
                }

                if (!data || !data.data || !Array.isArray(data.data)) {
                    console.error('Invalid data format:', data);
                    throw new Error('Invalid data format received from API');
                }

                console.log('Total flights received:', data.data.length); // Debug log

                const flights = data.data
                    .filter(flight => {
                        // Log each flight for debugging
                        console.log('Processing flight:', {
                            callsign: flight.flight?.iata || flight.flight?.icao,
                            airline: flight.airline?.name,
                            departure: flight.departure?.iata,
                            arrival: flight.arrival?.iata,
                            status: flight.flight_status
                        });
                        
                        // Accept flights that are either active, scheduled, or en-route
                        return (flight.flight_status === 'active' || 
                               flight.flight_status === 'scheduled' ||
                               flight.flight_status === 'en-route') &&
                               // Must have either live position or departure/arrival coordinates
                               ((flight.live?.latitude && flight.live?.longitude) || 
                                (flight.departure?.latitude && flight.departure?.longitude));
                    })
                    .map(flight => {
                        // Calculate position - prefer live position, fall back to departure
                        const position = {
                            lat: parseFloat(flight.live?.latitude || flight.departure?.latitude),
                            lng: parseFloat(flight.live?.longitude || flight.departure?.longitude)
                        };

                        // Calculate heading - either from live data or based on departure/arrival
                        const heading = flight.live?.direction || 
                            (flight.departure && flight.arrival ? 
                                calculateHeading(
                                    parseFloat(flight.departure.latitude),
                                    parseFloat(flight.departure.longitude),
                                    parseFloat(flight.arrival.latitude),
                                    parseFloat(flight.arrival.longitude)
                                ) : 0);

                        return {
                            icao24: flight.flight?.iata || flight.flight?.icao || 'UNKNOWN',
                            callsign: flight.flight?.iata || flight.flight?.icao || 'UNKNOWN',
                            country: flight.airline?.country_name || 'Unknown',
                            airline: flight.airline?.name || 'Unknown Airline',
                            position: position,
                            altitude: Math.round(parseFloat(flight.live?.altitude || 35000) * 3.28084), // Convert to feet
                            speed: Math.round(parseFloat(flight.live?.speed || 400)), // Use actual speed if available
                            heading: heading,
                            lastUpdate: Date.now() / 1000,
                            departure: flight.departure ? 
                                `${flight.departure.airport || ''} (${flight.departure.iata || 'N/A'})` : 'N/A',
                            arrival: flight.arrival ? 
                                `${flight.arrival.airport || ''} (${flight.arrival.iata || 'N/A'})` : 'N/A',
                            status: flight.flight_status,
                            isIndian: true // Since we're specifically querying Indian flights
                        };
                    });

                console.log(`Processed ${flights.length} valid Indian flights`); // Debug log
                
                if (flights.length === 0) {
                    console.log('No Indian flights found, falling back to mock data');
                    return generateMockFlights();
                }

                // Log the processed flights for debugging
                console.log('Processed flights:', flights);

                return flights;

            } catch (error) {
                console.error('API Error:', error);
                console.log('Falling back to mock data due to API error');
                return generateMockFlights();
            }

        } catch (error) {
            console.error('Error in fetchFlightData:', error);
            if (flightList) {
                flightList.innerHTML = `
                    <div class="error-message">
                        <p>Error fetching flight data: ${error.message}</p>
                        <p>Using simulated flight data instead.</p>
                    </div>`;
            }
            return generateMockFlights();
        } finally {
            isLoading = false;
            if (flightList) {
                flightList.classList.remove('loading');
            }
        }
    }

    // Helper function to calculate heading between two points
    function calculateHeading(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
                 Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

        const θ = Math.atan2(y, x);
        const heading = (θ * 180 / Math.PI + 360) % 360;
        
        return heading;
    }

    // Add error message styling
    const style = document.createElement('style');
    style.textContent = `
        .error-message {
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid rgba(255, 0, 0, 0.3);
            border-radius: 8px;
            padding: 15px;
            margin: 15px;
            color: var(--text-primary);
        }
        
        .error-message ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        .loading-message {
            text-align: center;
            padding: 20px;
            color: var(--text-primary);
        }
    `;
    document.head.appendChild(style);

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
            // Major Indian airports
            'DEL': { lat: 28.5665, lng: 77.1031, name: 'Indira Gandhi International Airport, Delhi' },
            'BOM': { lat: 19.0896, lng: 72.8656, name: 'Chhatrapati Shivaji International Airport, Mumbai' },
            'MAA': { lat: 12.9941, lng: 80.1709, name: 'Chennai International Airport' },
            'BLR': { lat: 13.1986, lng: 77.7066, name: 'Kempegowda International Airport, Bangalore' },
            'CCU': { lat: 22.6520, lng: 88.4463, name: 'Netaji Subhas Chandra Bose International Airport, Kolkata' },
            'HYD': { lat: 17.2403, lng: 78.4294, name: 'Rajiv Gandhi International Airport, Hyderabad' },
            // International hubs
            'DXB': { lat: 25.2532, lng: 55.3657, name: 'Dubai International Airport' },
            'SIN': { lat: 1.3644, lng: 103.9915, name: 'Singapore Changi Airport' },
            'LHR': { lat: 51.4700, lng: -0.4543, name: 'London Heathrow Airport' },
            'JFK': { lat: 40.6413, lng: -73.7781, name: 'John F Kennedy International Airport' }
        };

        const airlines = {
            'AI': { name: 'Air India', routes: ['DEL-BOM', 'BOM-MAA', 'DEL-CCU', 'BLR-DEL', 'HYD-DEL'] },
            'UK': { name: 'Vistara', routes: ['DEL-BOM', 'BLR-DEL', 'HYD-BOM', 'CCU-DEL', 'MAA-BLR'] },
            '6E': { name: 'IndiGo', routes: ['DEL-BOM', 'BLR-CCU', 'HYD-MAA', 'BOM-BLR', 'DEL-HYD'] },
            'SG': { name: 'SpiceJet', routes: ['DEL-BLR', 'BOM-CCU', 'MAA-HYD', 'BLR-BOM', 'HYD-DEL'] },
            // International airlines
            'EK': { name: 'Emirates', routes: ['DXB-DEL', 'DXB-BOM', 'DXB-BLR'] },
            'SQ': { name: 'Singapore Airlines', routes: ['SIN-DEL', 'SIN-BOM', 'SIN-BLR'] },
            'BA': { name: 'British Airways', routes: ['LHR-DEL', 'LHR-BOM', 'LHR-BLR'] },
            'AA': { name: 'American Airlines', routes: ['JFK-DEL', 'JFK-BOM'] }
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
                    country: airlineCode.match(/^(AI|UK|6E|SG)$/) ? 'India' : 'International',
                    airline: airline.name,
                    position: { lat, lng },
                    altitude: 25000 + Math.random() * 15000,
                    speed: 400 + Math.random() * 100,
                    heading: heading,
                    lastUpdate: Date.now() / 1000,
                    onGround: false,
                    departure: `${fromAirport} (${airports[fromAirport].name})`,
                    arrival: `${toAirport} (${airports[toAirport].name})`,
                    status: 'active',
                    isIndian: airlineCode.match(/^(AI|UK|6E|SG)$/) ? true : false
                });
            });
        });

        return mockFlights;
    }

    // Function to initialize the map
    function initMap() {
        console.log('Initializing map...');
        
        map = L.map('map', {
            center: [20.5937, 78.9629],  // Center on India
            zoom: 5,                     // Closer zoom on India
            minZoom: 2,                  // Allow zooming out to see the whole world
            maxZoom: 10,                 // Limit maximum zoom for performance
            zoomControl: false,
            attributionControl: true
        });

        // Add light theme map tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        // Initialize search
        searchInput = document.querySelector('#search');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }

        // Initialize altitude filters
        initAltitudeFilters();

        // Initial flight update
        updateFlights();
        
        // Update every 5 minutes to preserve API calls
        // Regular updates every 2 minutes to get fresh data
        setInterval(updateFlights, 120000);
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

        // Store flights for filtering
        allFlights = flights;
    }

    // Update flight list without India-specific prioritization
    function updateFlightList(flights) {
        const flightList = document.getElementById('flightList');
        if (!flightList) return;

        const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
        
        // Sort flights to show Indian flights first
        const sortedFlights = flights
            .sort((a, b) => {
                if (a.isIndian && !b.isIndian) return -1;
                if (!a.isIndian && b.isIndian) return 1;
                return 0;
            })
            .filter(flight => 
                flight.callsign.toLowerCase().includes(searchQuery) ||
                flight.country.toLowerCase().includes(searchQuery) ||
                (flight.departure && flight.departure.toLowerCase().includes(searchQuery)) ||
                (flight.arrival && flight.arrival.toLowerCase().includes(searchQuery))
            )
            .slice(0, 100); // Limit to 100 flights for performance

        const flightCards = sortedFlights.map(flight => `
            <div class="flight-card ${flight.isIndian ? 'indian-flight' : ''}" 
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
            // Remove existing tiles
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    map.removeLayer(layer);
                }
            });
            
            // Add new tiles based on theme
            const tileUrl = newTheme === 'dark' 
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            
            L.tileLayer(tileUrl, {
                attribution: '©OpenStreetMap, ©CartoDB',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);
        }
    };

    // Center map on India function
    window.centerOnIndia = function() {
        map.setView([20.5937, 78.9629], 4);
    };

    // Add India center button to the map
    function addIndiaCenterButton() {
        const indiaCenterBtn = L.control({ position: 'bottomright' });
        
        indiaCenterBtn.onAdd = function() {
            const div = L.DomUtil.create('div', 'location-btn india-center-btn');
            div.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
            div.title = 'Center on India';
            
            div.onclick = function() {
                centerOnIndia();
            };
            
            return div;
        };
        
        indiaCenterBtn.addTo(map);
    }

    // Modify initMap to add the India center button
    const originalInitMap = window.initMap;
    window.initMap = function() {
        originalInitMap();
        addIndiaCenterButton();
    };

    // Initialize the map
    initMap();
}); 
