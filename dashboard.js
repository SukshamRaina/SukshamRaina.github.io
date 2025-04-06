// Check authentication and load profile
function checkAuth() {
    const userEmail = localStorage.getItem('userEmail');
    const userName = localStorage.getItem('userName');
    
    if (!userEmail) {
        window.location.href = 'signup.html';
        return;
    }

    // Display user info
    document.getElementById('user-name').textContent = userName || userEmail;
}

// Load vehicle data from profile
function loadVehicleFromProfile() {
    const savedData = localStorage.getItem('profileData');
    if (savedData) {
        const profileData = JSON.parse(savedData);
        
        // Convert units and update vehicle information
        vehicleManager.setVehicle({
            weight: parseFloat(profileData.vehicleWeight) * 1000, // Convert tons to kg
            height: parseFloat(profileData.vehicleHeight) * 0.3048, // Convert feet to meters
            type: profileData.vehicleType || 'Heavy Truck'
        });
    }
}

// Initialize map
let map = L.map('map').setView([20.5937, 78.9629], 5); // Default view of India
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Initialize the geocoding service
const geocoder = L.Control.Geocoder.nominatim();

// Location search functionality
function initializeLocationSearch() {
    const startInput = document.getElementById('start-search');
    const endInput = document.getElementById('end-search');
    
    // Create suggestion containers
    const startSuggestions = document.createElement('div');
    const endSuggestions = document.createElement('div');
    startSuggestions.className = 'location-suggestions';
    endSuggestions.className = 'location-suggestions';
    
    startInput.parentNode.style.position = 'relative';
    endInput.parentNode.style.position = 'relative';
    startInput.parentNode.appendChild(startSuggestions);
    endInput.parentNode.appendChild(endSuggestions);

    // Add event listeners for search inputs
    startInput.addEventListener('input', debounce((e) => {
        searchLocation(e.target.value, startSuggestions, 'start');
    }, 300));

    endInput.addEventListener('input', debounce((e) => {
        searchLocation(e.target.value, endSuggestions, 'end');
    }, 300));

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.location-search')) {
            startSuggestions.style.display = 'none';
            endSuggestions.style.display = 'none';
        }
    });
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Search location using geocoding
function searchLocation(query, suggestionsContainer, type) {
    if (!query) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    geocoder.geocode(query, (results) => {
        suggestionsContainer.innerHTML = '';
        if (results.length > 0) {
            results.slice(0, 5).forEach(result => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerHTML = `<i class="fas fa-map-marker-alt"></i>${result.name}`;
                item.addEventListener('click', () => {
                    selectLocation(result, type);
                    suggestionsContainer.style.display = 'none';
                });
                suggestionsContainer.appendChild(item);
            });
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    });
}

// Handle location selection
function selectLocation(location, type) {
    const input = document.getElementById(`${type}-search`);
    const point = document.getElementById(`${type}-point`);
    const city = document.getElementById(`${type}-city`);
    
    input.value = location.name;
    point.textContent = location.name;
    city.textContent = location.city || location.name.split(',')[0];

    if (type === 'start') {
        routeManager.setStartLocation(location);
    } else {
        routeManager.setEndLocation(location);
    }
}

// Get current location
function getCurrentLocation(type) {
    if (!navigator.geolocation) {
        notifications.addNotification('alert', 'Geolocation is not supported by your browser');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            
            // Reverse geocode the coordinates
            geocoder.reverse(
                { lat: latitude, lng: longitude },
                map.options.crs.scale(map.getZoom()),
                results => {
                    if (results.length > 0) {
                        selectLocation(results[0], type);
                    }
                }
            );
        },
        (error) => {
            notifications.addNotification('alert', 'Unable to retrieve your location');
        }
    );
}

// Route management
class RouteManager {
    constructor() {
        this.currentRoute = null;
        this.routeLine = null;
        this.startMarker = null;
        this.endMarker = null;
        this.startLocation = null;
        this.endLocation = null;
    }

    setStartLocation(location) {
        this.startLocation = location;
        if (this.startMarker) {
            map.removeLayer(this.startMarker);
        }
        this.startMarker = L.marker([location.center.lat, location.center.lng], {
            icon: L.divIcon({
                className: 'custom-marker start-marker',
                html: '<i class="fas fa-circle"></i>',
                iconSize: [20, 20]
            })
        }).addTo(map);
        this.fitMapToMarkers();
    }

    setEndLocation(location) {
        this.endLocation = location;
        if (this.endMarker) {
            map.removeLayer(this.endMarker);
        }
        this.endMarker = L.marker([location.center.lat, location.center.lng], {
            icon: L.divIcon({
                className: 'custom-marker end-marker',
                html: '<i class="fas fa-circle"></i>',
                iconSize: [20, 20]
            })
        }).addTo(map);
        this.fitMapToMarkers();
    }

    fitMapToMarkers() {
        const bounds = [];
        if (this.startMarker) bounds.push(this.startMarker.getLatLng());
        if (this.endMarker) bounds.push(this.endMarker.getLatLng());
        if (bounds.length > 0) {
            map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
        }
    }

    calculateRoute() {
        if (!this.startLocation || !this.endLocation) {
            notifications.addNotification('alert', 'Please select both start and end locations');
            return;
        }

        // Clear existing route
        if (this.routeLine) {
            map.removeLayer(this.routeLine);
        }

        try {
            // Create route line between points
            const coordinates = [
                [this.startLocation.center.lat, this.startLocation.center.lng],
                [this.endLocation.center.lat, this.endLocation.center.lng]
            ];

            this.routeLine = L.polyline(coordinates, {
                color: '#2ecc71',
                weight: 6,
                opacity: 0.8
            }).addTo(map);

            // Calculate approximate distance and time
            const distance = this.calculateDistance(coordinates[0], coordinates[1]);
            const eta = this.calculateETA(distance);

            // Update route information
            document.getElementById('distance').textContent = `${distance.toFixed(1)} km`;
            document.getElementById('eta').textContent = eta;
            document.getElementById('departure-time').textContent = this.getCurrentTime();
            document.getElementById('arrival-time').textContent = this.getArrivalTime(eta);

            // Fit map to show the entire route
            map.fitBounds(this.routeLine.getBounds(), { padding: [50, 50] });

            // Check for vehicle restrictions
            if (vehicleManager.currentVehicle) {
                const restrictions = vehicleManager.checkRestrictions({
                    maxWeight: 15000,
                    maxHeight: 4.5
                });
                restrictions.forEach(restriction => {
                    notifications.addNotification('alert', restriction);
                });
            }

            // Add success notification
            notifications.addNotification('info', 'Route calculated successfully');
        } catch (error) {
            notifications.addNotification('alert', 'Error calculating route. Please try again.');
            console.error('Route calculation error:', error);
        }
    }

    calculateDistance(point1, point2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(point2[0] - point1[0]);
        const dLon = this.toRad(point2[1] - point1[1]);
        const lat1 = this.toRad(point1[0]);
        const lat2 = this.toRad(point2[0]);

        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    toRad(degrees) {
        return degrees * Math.PI / 180;
    }

    calculateETA(distance) {
        const avgSpeed = 60; // Average speed in km/h
        const hours = distance / avgSpeed;
        const hoursInt = Math.floor(hours);
        const minutes = Math.round((hours - hoursInt) * 60);
        return `${hoursInt}h ${minutes}m`;
    }

    getCurrentTime() {
        return new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    getArrivalTime(eta) {
        const [hours, minutes] = eta.split('h ');
        const now = new Date();
        now.setHours(now.getHours() + parseInt(hours));
        now.setMinutes(now.getMinutes() + parseInt(minutes));
        return now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    clearRoute() {
        try {
            if (this.routeLine) map.removeLayer(this.routeLine);
            if (this.startMarker) map.removeLayer(this.startMarker);
            if (this.endMarker) map.removeLayer(this.endMarker);
            
            this.routeLine = null;
            this.startMarker = null;
            this.endMarker = null;
            this.startLocation = null;
            this.endLocation = null;

            // Reset form fields
            document.getElementById('start-search').value = '';
            document.getElementById('end-search').value = '';
            document.getElementById('start-point').textContent = 'Select a route...';
            document.getElementById('end-point').textContent = 'Select a route...';
            document.getElementById('departure-time').textContent = '--:--';
            document.getElementById('arrival-time').textContent = '--:--';
            document.getElementById('start-city').textContent = '--';
            document.getElementById('end-city').textContent = '--';
            document.getElementById('eta').textContent = '--:--';
            document.getElementById('distance').textContent = '-- km';

            // Reset map view
            map.setView([20.5937, 78.9629], 5);

            // Add success notification
            notifications.addNotification('info', 'Route cleared successfully');
        } catch (error) {
            notifications.addNotification('alert', 'Error clearing route. Please try again.');
            console.error('Route clearing error:', error);
        }
    }
}

// Vehicle management
class VehicleManager {
    constructor() {
        this.currentVehicle = null;
    }

    setVehicle(vehicle) {
        this.currentVehicle = vehicle;
        if (vehicle) {
            document.getElementById('vehicle-weight').textContent = `${Math.round(vehicle.weight / 1000)} tons`;
            document.getElementById('vehicle-height').textContent = `${vehicle.height.toFixed(1)} m`;
            document.getElementById('vehicle-type').textContent = vehicle.type;
        }
    }

    checkRestrictions(route) {
        if (!this.currentVehicle || !route) return [];

        const restrictions = [];
        
        if (this.currentVehicle.weight > route.maxWeight) {
            restrictions.push(`Weight restriction: Maximum allowed ${route.maxWeight/1000}tons`);
        }
        
        if (this.currentVehicle.height > route.maxHeight) {
            restrictions.push(`Height restriction: Maximum allowed ${route.maxHeight}m`);
        }

        return restrictions;
    }
}

// Notification system
class NotificationSystem {
    constructor() {
        this.container = document.getElementById('notifications-list');
    }

    addNotification(type, message, time = 'Just now') {
        // Remove empty state if present
        const emptyState = this.container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'notification-item';
        
        let iconClass;
        switch (type) {
            case 'traffic':
                iconClass = 'fa-traffic-light';
                break;
            case 'weather':
                iconClass = 'fa-cloud';
                break;
            case 'alert':
                iconClass = 'fa-exclamation-triangle';
                break;
            default:
                iconClass = 'fa-info-circle';
        }

        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="notification-content">
                <p>${message}</p>
                <span class="notification-time">${time}</span>
            </div>
        `;

        this.container.insertBefore(notification, this.container.firstChild);
        this.updateBadge();

        // Remove notification after 1 minute
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.remove();
                this.updateBadge();
                // Add empty state if no notifications
                if (this.container.children.length === 0) {
                    this.showEmptyState();
                }
            }, 300);
        }, 60000);
    }

    updateBadge() {
        const badge = document.querySelector('.notification-badge');
        const count = this.container.querySelectorAll('.notification-item').length;
        badge.textContent = count;
    }

    showEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell-slash"></i>
                <p>No notifications yet</p>
            </div>
        `;
    }
}

// Initialize systems
const routeManager = new RouteManager();
const vehicleManager = new VehicleManager();
const notifications = new NotificationSystem();

// Traffic layer toggle
let trafficLayer = null;
document.getElementById('traffic-toggle').addEventListener('click', function() {
    if (!trafficLayer) {
        // Add traffic layer (integrate with actual traffic API)
        trafficLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            opacity: 0.5
        }).addTo(map);
        this.classList.add('active');
    } else {
        map.removeLayer(trafficLayer);
        trafficLayer = null;
        this.classList.remove('active');
    }
});

// Weather toggle
document.getElementById('weather-toggle').addEventListener('click', function() {
    // Integrate with weather API
    this.classList.toggle('active');
});

// Logout handler
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('profileData');
    window.location.href = 'landing.html';
});

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadVehicleFromProfile();
    initializeLocationSearch();
    
    // Add event listeners for route buttons
    const calculateRouteBtn = document.querySelector('.calculate-route');
    const clearRouteBtn = document.querySelector('.clear-route');
    
    if (calculateRouteBtn) {
        calculateRouteBtn.addEventListener('click', () => {
            routeManager.calculateRoute();
        });
    }
    
    if (clearRouteBtn) {
        clearRouteBtn.addEventListener('click', () => {
            routeManager.clearRoute();
        });
    }
});

// Mobile sidebar toggle
const hamburger = document.querySelector('.hamburger');
const sidebar = document.querySelector('.sidebar');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

// Simulate real-time updates
function simulateUpdates() {
    // Update ETA
    const eta = document.getElementById('eta');
    let [hours, minutes] = eta.textContent.split('h ');
    minutes = parseInt(minutes);
    
    if (Math.random() > 0.5) {
        minutes += Math.floor(Math.random() * 5);
    } else {
        minutes -= Math.floor(Math.random() * 5);
    }
    
    eta.textContent = `2h ${minutes}m`;

    // Random notifications
    const events = [
        { type: 'traffic', message: 'Heavy traffic detected ahead on Route A1' },
        { type: 'weather', message: 'Weather alert: Heavy rain expected in 30 minutes' },
        { type: 'alert', message: 'Road work ahead: Expect delays' }
    ];

    if (Math.random() > 0.7) {
        const event = events[Math.floor(Math.random() * events.length)];
        notifications.addNotification(event.type, event.message);
    }
}

// Update every 30 seconds
setInterval(simulateUpdates, 30000);

// Weather updates
function updateWeather() {
    // Simulate weather updates (replace with actual weather API)
    const weatherConditions = [
        'Clear skies ahead',
        'Light rain expected',
        'Strong winds in the area',
        'Poor visibility due to fog'
    ];

    const condition = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
    notifications.addNotification('weather', condition);
}

// Update weather every 5 minutes
setInterval(updateWeather, 300000);

// Initial weather update
updateWeather(); 