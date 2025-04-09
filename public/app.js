document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('cameraFeed');
    const captureBtn = document.getElementById('captureBtn');
    const capturedImage = document.getElementById('capturedImage');
    const cameraContainer = document.querySelector('.relative');
    const capturedImageContainer = document.querySelector('.captured-image-container');
    const retakeBtn = document.getElementById('retakeBtn');
    const results = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessage = document.getElementById('errorMessage');

    let currentStream = null;

    // Initialize camera
    async function initCamera() {
        try {
            if (!window.isSecureContext) {
                throw new Error('Camera access requires HTTPS');
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support camera access');
            }

            // Stop any existing stream
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }

            video.muted = true;
            video.setAttribute('playsinline', true);

            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 }
                }
            };

            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.log('Falling back to basic constraints');
                currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
            }

            video.srcObject = currentStream;
            await video.play();
            captureBtn.disabled = false;
            captureBtn.classList.add('animate-pulse');
        } catch (error) {
            console.error('Error accessing camera:', error);
            let errorMessage = 'Unable to access camera. ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please ensure camera permissions are granted.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera device found.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Camera is already in use.';
            } else {
                errorMessage += 'Please check your camera settings and try again.';
            }
            showError(errorMessage);
        }
    }

    // Show error message
    function showError(message) {
        errorMessage.querySelector('span').textContent = message;
        errorMessage.classList.remove('hidden');
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 5000);
    }

    // Capture image
    function captureImage() {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Add capture animation
        capturedImage.src = canvas.toDataURL('image/jpeg');
        capturedImageContainer.classList.remove('hidden');
        video.classList.add('hidden');
        
        // Add flash effect
        cameraContainer.classList.add('bg-white');
        setTimeout(() => {
            cameraContainer.classList.remove('bg-white');
        }, 300);

        // Hide capture button and show retake button
        captureBtn.classList.add('hidden');
        retakeBtn.classList.remove('hidden');

        return canvas.toDataURL('image/jpeg');
    }

    // Retake photo
    function retakePhoto() {
        // Reset UI elements
        video.classList.remove('hidden');
        capturedImageContainer.classList.add('hidden');
        captureBtn.classList.remove('hidden');
        retakeBtn.classList.add('hidden');
        results.classList.add('hidden');
        resultsContent.innerHTML = '';

        // Reinitialize the camera
        initCamera();
    }

    // Analyze image
    async function analyzeImage(imageData) {
        try {
            results.classList.remove('hidden');
            loadingSpinner.classList.remove('hidden');
            resultsContent.textContent = '';

            if (!imageData || imageData.length < 100) {
                throw new Error('Invalid image data. Please try capturing the image again.');
            }

            const response = await fetch('/api/analyze-product', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageData })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            console.log('Server response:', data);
            if (!data.success || !data.analysis || (!data.analysis.brand && !data.analysis.product)) {
                throw new Error('Invalid response from server. Please try again.');
            }

            // Format and display results
            let formattedHtml = `
                <div class="mb-6">
                    <p class="mb-3 text-lg"><strong class="text-gray-800">Brand:</strong> <span class="text-gray-700">${data.analysis.brand || 'Not detected'}</span></p>
                    <p class="mb-3 text-lg"><strong class="text-gray-800">Product:</strong> <span class="text-gray-700">${data.analysis.product || 'Not detected'}</span></p>
                </div>
            `;

            if (data.analysis.isIsraeliProduct) {
                formattedHtml += `<div class="mt-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                    <div class="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p class="font-bold text-red-700">⚠️ Israeli Product Detected</p>
                    </div>
                    <p class="mt-2 text-red-600">This product or brand is associated with Israel.</p>
                </div>`;
            } else {
                formattedHtml += `<div class="mt-6 bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
                    <div class="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p class="font-bold text-green-700">✅ Not an Israeli Product</p>
                    </div>
                    <p class="mt-2 text-green-600">This product or brand is not associated with Israel.</p>
                </div>`;
            }

            resultsContent.innerHTML = formattedHtml;
        } catch (error) {
            console.error('Analysis error:', error);
            showError(error.message || 'Failed to analyze image. Please try again.');
            resultsContent.innerHTML = '';
        } finally {
            loadingSpinner.classList.add('hidden');
        }
    }

    // Event listeners
    captureBtn.addEventListener('click', () => {
        const imageData = captureImage();
        analyzeImage(imageData);
    });

    retakeBtn.addEventListener('click', retakePhoto);

    // Initialize
    initCamera();
});