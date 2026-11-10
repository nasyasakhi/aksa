
document.addEventListener("DOMContentLoaded", function () {
    const navbar = document.querySelector(".aksa-navbar");
    const menuToggle = document.getElementById("menuToggle");
    const navbarMenu = document.getElementById("navbarMenu");
    const navLinks = document.querySelectorAll(".nav-link");

    if (!navbar || !menuToggle || !navbarMenu) return;

    // Navbar scroll effect
    window.addEventListener("scroll", function () {
        navbar.classList.toggle("scrolled", window.scrollY > 50);
    });

    // Toggle hamburger
    menuToggle.addEventListener("click", function (e) {
        e.stopPropagation();

        const isOpen = navbarMenu.classList.toggle("show");

        menuToggle.innerHTML = isOpen
            ? "<i class='bx bx-x'></i>"
            : "<i class='bx bx-menu'></i>";

        menuToggle.setAttribute("aria-expanded", isOpen);
    });

    // Klik menu
    navLinks.forEach(link => {
        link.addEventListener("click", function () {
            navLinks.forEach(item => item.classList.remove("active"));
            this.classList.add("active");

            navbarMenu.classList.remove("show");
            menuToggle.innerHTML = "<i class='bx bx-menu'></i>";
            menuToggle.setAttribute("aria-expanded", "false");
        });
    });

    // Klik di luar navbar
    document.addEventListener("click", function (e) {
        if (!navbar.contains(e.target)) {
            navbarMenu.classList.remove("show");
            menuToggle.innerHTML = "<i class='bx bx-menu'></i>";
            menuToggle.setAttribute("aria-expanded", "false");
        }
    });

    // Escape key
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            navbarMenu.classList.remove("show");
            menuToggle.innerHTML = "<i class='bx bx-menu'></i>";
            menuToggle.setAttribute("aria-expanded", "false");
        }
    });

    // Counting number animation
    const counters = document.querySelectorAll("#counting .fw-bold");

    counters.forEach(counter => {
        const target = Number(counter.innerText);
        let count = 0;
        const increment = target / 100;

        const updateCounter = () => {
            count += increment;

            if (count < target) {
                counter.innerText = Math.ceil(count);
                setTimeout(updateCounter, 10);
            } else {
                counter.innerText = target;
            }
        };

        updateCounter();
    });
});
