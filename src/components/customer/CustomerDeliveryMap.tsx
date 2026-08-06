'use client';

import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { point, lineString } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { auth } from '@/lib/firebase';
// import from '@turf/distance';

interface CustomerDeliveryMapProps {
  orderId: string;
  riderLocation?: { lat: number; lng: number };
  deliveryLocation?: { lat: number; lng: number };
}

// Icons
const bikeIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972185.png', // A simple delivery bike icon
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  className: 'transition-all duration-1000 ease-linear' // CSS transition for smooth gliding!
});

const homeIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/25/25694.png', // Simple home icon
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

function MapFitter({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);
  return null;
}

export default function CustomerDeliveryMap({ orderId, riderLocation, deliveryLocation }: CustomerDeliveryMapProps) {
  const [ordersAhead, setOrdersAhead] = useState(0);
  const [authorizedRiderLocation, setAuthorizedRiderLocation] = useState<{ lat: number; lng: number }>();
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [snappedRider, setSnappedRider] = useState<{lat: number, lng: number} | null>(null);
  const [etaMins, setEtaMins] = useState<number | null>(null);
  const fetchedRoute = useRef(false);

  const effectiveRiderLocation = riderLocation || authorizedRiderLocation;

  // Poll the assignment-scoped projection. The API verifies order ownership
  // before returning this rider's current, unexpired coordinate.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function fetchQueue() {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch(`/api/customer/active-route?order_id=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (active && res.ok && typeof data.orders_ahead === 'number') {
          setOrdersAhead(data.orders_ahead);
          const location = data.rider_location;
          setAuthorizedRiderLocation(
            location && typeof location.lat === 'number' && typeof location.lng === 'number'
              ? { lat: location.lat, lng: location.lng }
              : undefined,
          );
        }
      } catch (err) {
        console.error("Failed to fetch delivery queue", err);
      } finally {
        if (active) timer = setTimeout(() => void fetchQueue(), 8000);
      }
    }
    void fetchQueue();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  useEffect(() => {
    if (!effectiveRiderLocation || !deliveryLocation || fetchedRoute.current) return;
    const dest = deliveryLocation;
    const origin = effectiveRiderLocation;

    async function fetchOsrm() {
      try {
        // Construct coordinates string: lng,lat;lng,lat...
        const points = [
          [origin.lng, origin.lat],
          [dest.lng, dest.lat]
        ];

        const coordString = points.map(p => `${p[0]},${p[1]}`).join(';');
        
        // Fetch route from OSRM
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`);
        const data = await res.json();

        if (data.code === 'Ok' && data.routes.length > 0) {
          const route = data.routes[0];
          // GeoJSON coordinates are [lng, lat]
          setRouteCoordinates(route.geometry.coordinates);
          setEtaMins(Math.ceil(route.duration / 60));
          fetchedRoute.current = true;
        }
      } catch (err) {
        console.error("Failed to fetch OSRM route", err);
      }
    }

    fetchOsrm();
  }, [effectiveRiderLocation, deliveryLocation]);

  // 3. Snap-to-Road Logic
  useEffect(() => {
    if (!effectiveRiderLocation) return;
    
    if (routeCoordinates.length > 1) {
      try {
        const rPt = point([effectiveRiderLocation.lng, effectiveRiderLocation.lat]);
        const rLine = lineString(routeCoordinates);
        
        // Find nearest point and get distance (dist is in properties in kilometers)
        const snapped = nearestPointOnLine(rLine, rPt, { units: 'kilometers' });
        const dist = snapped.properties.dist ?? 0;
        
        if (dist > 0.2) {
          setSnappedRider(effectiveRiderLocation); // Raw fallback
        } else {
          // Snap returns [lng, lat]
          setSnappedRider({ lat: snapped.geometry.coordinates[1], lng: snapped.geometry.coordinates[0] });
        }
      } catch (err) {
        console.error("Turf snapping error", err);
        setSnappedRider(effectiveRiderLocation);
      }
    } else {
      setSnappedRider(effectiveRiderLocation);
    }
  }, [effectiveRiderLocation, routeCoordinates]);

  if (!deliveryLocation) return null;

  // Calculate Map Bounds
  const bounds = L.latLngBounds([deliveryLocation.lat, deliveryLocation.lng], [deliveryLocation.lat, deliveryLocation.lng]);
  if (effectiveRiderLocation) bounds.extend([effectiveRiderLocation.lat, effectiveRiderLocation.lng]);

  return (
    <div className="w-full relative rounded-2xl overflow-hidden shadow-lg border border-white/10" style={{ height: '240px' }}>
      
      {etaMins !== null && (
        <div className="absolute top-4 left-4 z-[400] bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-primary/30 shadow-[0_0_10px_rgba(248,188,81,0.2)]">
          <span className="text-white font-mono text-xs uppercase tracking-wider">
            ETA: <span className="text-primary font-bold">{etaMins} Min</span>
          </span>
        </div>
      )}

      {ordersAhead > 0 && (
        <div className="absolute top-14 left-4 z-[400] bg-black/80 px-3 py-1.5 rounded-full text-white font-mono text-[10px]">
          {ordersAhead} stop{ordersAhead === 1 ? '' : 's'} ahead
        </div>
      )}

      <MapContainer 
        center={[deliveryLocation.lat, deliveryLocation.lng]} 
        zoom={13} 
        scrollWheelZoom={false} 
        style={{ height: '100%', width: '100%', background: '#111' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapFitter bounds={bounds} />

        {/* Drawn OSRM Route Path */}
        {routeCoordinates.length > 0 && (
          <Polyline 
            positions={routeCoordinates.map(c => [c[1], c[0]] as [number, number])} 
            color="#d4a354" 
            weight={4} 
            opacity={0.8}
            dashArray="10, 10"
            className="animate-pulse"
          />
        )}

        {/* Destination Location */}
        <Marker position={[deliveryLocation.lat, deliveryLocation.lng]} icon={homeIcon} />

        {/* Snapped Rider Location (With CSS Interpolation) */}
        {snappedRider && (
          <Marker position={[snappedRider.lat, snappedRider.lng]} icon={bikeIcon} />
        )}
      </MapContainer>
    </div>
  );
}
