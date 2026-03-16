const statusEl = document.getElementById("status");
const locationBtn = document.getElementById("btn-location");

const map = L.map("map").setView([16.5, 107.5], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let marker = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function showGpsHelpPopup() {
  window.alert(
    "Không lấy được vị trí hiện tại.\n\n" +
      "1) Bật GPS/Dịch vụ định vị trên thiết bị.\n" +
      "2) Vào phần quyền của trình duyệt và cho phép Vị trí.\n" +
      "3) Thử lại nút Xin quyền vị trí."
  );
}

function requestCurrentLocation() {
  if (!("geolocation" in navigator)) {
    setStatus("Trình duyệt không hỗ trợ geolocation.");
    showGpsHelpPopup();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      setStatus("Đã lấy vị trí hiện tại thành công.");

      if (!marker) {
        marker = L.marker([lat, lng]).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
      }

      map.flyTo([lat, lng], 15, { duration: 1.2 });
    },
    () => {
      setStatus("Bạn từ chối quyền vị trí hoặc GPS đang tắt.");
      showGpsHelpPopup();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

locationBtn.addEventListener("click", requestCurrentLocation);
