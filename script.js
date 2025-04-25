// DOM Elements
const configSection = document.getElementById('config');
const timerDisplaySection = document.getElementById('timer-display');
const startPauseButton = document.getElementById('startPauseButton');
const resetButton = document.getElementById('resetButton');
const currentStateDisplay = document.getElementById('currentState');
const timerDisplay = document.getElementById('timer');
const roundInfoDisplay = document.getElementById('roundInfo');
const progressBar = document.getElementById('progressBar');
const nextUpDisplay = document.getElementById('nextUp');
const errorMessage = document.getElementById('errorMessage');

// Input Fields
const roundsInput = document.getElementById('rounds');
const exercisesPerRoundInput = document.getElementById('exercisesPerRound');
const exerciseTimeInput = document.getElementById('exerciseTime');
const restTimeInput = document.getElementById('restTime');
const roundRestTimeInput = document.getElementById('roundRestTime');

// State Variables
let totalRounds = 0;
let exercisesPerRound = 0;
let exerciseTime = 0;
let restTime = 0;
let roundRestTime = 0;

let currentRound = 1;
let currentExercise = 1;
let currentTime = 0;
let intervalId = null;
let state = 'idle'; // idle, prepare, exercise, rest, roundRest, finished
let isPaused = false;
let totalTimeForCurrentPhase = 0; // Used for progress bar

// --- Speech Synthesis ---
let synth = window.speechSynthesis;
let utterance = new SpeechSynthesisUtterance();
utterance.lang = 'en-US'; // You can change the language if needed
utterance.rate = 1.0; // Adjust speed if necessary

function speak(text) {
    if (!synth) {
        console.warn("Speech Synthesis not supported.");
        return;
    }
    // Cancel any previous speech to avoid overlaps if commands come fast
    synth.cancel();
    utterance.text = text;
    try {
        synth.speak(utterance);
    } catch (error) {
        console.error("Speech synthesis error:", error);
        errorMessage.textContent = "Speech synthesis failed. Please ensure permissions are granted.";
    }
}

// --- Timer Logic ---

function updateDisplay() {
    // Format time as MM:SS or just SS
    timerDisplay.textContent = String(currentTime).padStart(2, '0');

    // Update round/exercise info
    if (state !== 'idle' && state !== 'finished' && state !== 'prepare') {
         roundInfoDisplay.textContent = `Round: ${currentRound} / ${totalRounds} | Exercise: ${currentExercise} / ${exercisesPerRound}`;
    } else if (state === 'prepare') {
         roundInfoDisplay.textContent = `Starting Round: 1 / ${totalRounds} | Exercise: 1 / ${exercisesPerRound}`;
    } else if (state === 'finished') {
         roundInfoDisplay.textContent = `Completed: ${totalRounds} Rounds | ${totalRounds * exercisesPerRound} Exercises`;
    }
     else {
        roundInfoDisplay.textContent = 'Round: - / - | Exercise: - / -';
    }

    // Update progress bar
    let progressPercent = 0;
    if (totalTimeForCurrentPhase > 0 && state !== 'idle' && state !== 'finished') {
        progressPercent = ((totalTimeForCurrentPhase - currentTime) / totalTimeForCurrentPhase) * 100;
    } else if (state === 'finished') {
        progressPercent = 100;
    }
    progressBar.style.width = `${progressPercent}%`;

    // Update Current State Text and Styling
    timerDisplaySection.className = 'timer-section card'; // Reset classes
    switch (state) {
        case 'idle':
            currentStateDisplay.textContent = 'Configure & Start';
             nextUpDisplay.textContent = '';
            break;
         case 'prepare':
            currentStateDisplay.textContent = 'Get Ready!';
            timerDisplaySection.classList.add('rest'); // Use rest styling for prep
            progressBar.style.backgroundColor = '#f5a623'; // Match rest color
            nextUpDisplay.textContent = `Next: Exercise 1`;
            break;
        case 'exercise':
            currentStateDisplay.textContent = `Exercise ${currentExercise}`;
            timerDisplaySection.classList.add('exercise');
             progressBar.style.backgroundColor = '#4a90e2';
             nextUpDisplay.textContent = (restTime > 0) ? `Next: Rest` : `Next: Exercise ${currentExercise + 1}`;
             if (currentExercise === exercisesPerRound) {
                 nextUpDisplay.textContent = (roundRestTime > 0 && currentRound < totalRounds) ? `Next: Round Rest` : (currentRound < totalRounds) ? `Next: Exercise 1 (Round ${currentRound + 1})` : 'Next: Finish!';
             }
            break;
        case 'rest':
            currentStateDisplay.textContent = 'Rest';
            timerDisplaySection.classList.add('rest');
             progressBar.style.backgroundColor = '#f5a623';
            nextUpDisplay.textContent = `Next: Exercise ${currentExercise}`;
            break;
        case 'roundRest':
            currentStateDisplay.textContent = 'Round Rest';
            timerDisplaySection.classList.add('round-rest');
            progressBar.style.backgroundColor = '#d0021b';
            nextUpDisplay.textContent = `Next: Exercise 1 (Round ${currentRound})`;
            break;
        case 'finished':
            currentStateDisplay.textContent = 'Workout Complete!';
            timerDisplaySection.classList.add('finished');
             progressBar.style.backgroundColor = '#4CAF50';
            nextUpDisplay.textContent = 'Well done!';
            break;
    }
}


function tick() {
    if (isPaused) return;

    currentTime--;

    // --- Voice Cues ---
    if (state === 'exercise') {
        const halfway = Math.ceil(totalTimeForCurrentPhase / 2); // Use ceil for odd numbers
        if (currentTime === halfway) {
            speak("Halfway");
        } else if (currentTime <= 5 && currentTime > 0) {
            speak(String(currentTime));
        } else if (currentTime === 0) {
             // Determine next state *before* speaking
            const isLastExercise = currentExercise === exercisesPerRound;
            const isLastRound = currentRound === totalRounds;
             if (!isLastExercise && restTime > 0) {
                speak("Rest");
            } else if (isLastExercise && !isLastRound && roundRestTime > 0) {
                speak("Round Complete. Rest.");
            }
            // No sound if going directly to next exercise or finishing
        }
    } else if (state === 'rest' || state === 'roundRest' || state === 'prepare') {
         if (currentTime <= 3 && currentTime > 0) { // Countdown for rest end
            speak(String(currentTime));
        } else if (currentTime === 0) {
            // Speak "Begin" just before transitioning
             if (state === 'prepare' || state === 'rest' || state === 'roundRest') {
                 speak("Begin");
             }
        }
    }

    // --- State Transitions ---
    if (currentTime < 0) {
        moveToNextState();
    }

    updateDisplay();
}

function moveToNextState() {
    if (state === 'prepare') {
        startExercise();
    } else if (state === 'exercise') {
        const isLastExercise = currentExercise === exercisesPerRound;
        const isLastRound = currentRound === totalRounds;

        if (isLastExercise && isLastRound) {
            finishWorkout();
        } else if (isLastExercise) {
             if (roundRestTime > 0) {
                startRoundRest();
            } else {
                // Go directly to next round's first exercise
                currentRound++;
                currentExercise = 1;
                startExercise(); // Start immediately, no round rest time
            }
        } else {
            if (restTime > 0) {
                startRest();
            } else {
                // Go directly to next exercise
                currentExercise++;
                startExercise(); // Start immediately, no rest time
            }
        }
    } else if (state === 'rest') {
        currentExercise++;
        startExercise();
    } else if (state === 'roundRest') {
        currentRound++;
        currentExercise = 1;
        startExercise();
    }
}

function startPrepare() {
    state = 'prepare';
    currentTime = 5; // 5 second prep time
    totalTimeForCurrentPhase = 5;
    speak("Get Ready. Starting in 5"); // Announce prep start
    updateDisplay(); // Show initial prep state
    intervalId = setInterval(tick, 1000);
}


function startExercise() {
    state = 'exercise';
    currentTime = exerciseTime;
    totalTimeForCurrentPhase = exerciseTime;
    // Announce exercise start only if not the very first one (already covered by "Begin")
    // if (!(currentRound === 1 && currentExercise === 1)) { // Let the "Begin" from tick() handle it
    //     speak(`Exercise ${currentExercise}`);
    // }
    updateDisplay();
}

function startRest() {
    state = 'rest';
    currentTime = restTime;
    totalTimeForCurrentPhase = restTime;
    updateDisplay();
}

function startRoundRest() {
    state = 'roundRest';
    currentTime = roundRestTime;
    totalTimeForCurrentPhase = roundRestTime;
    updateDisplay();
}

function finishWorkout() {
    state = 'finished';
    currentTime = 0;
    totalTimeForCurrentPhase = 0;
    clearInterval(intervalId);
    intervalId = null;
    startPauseButton.textContent = 'Start';
    startPauseButton.classList.remove('pause');
    configSection.style.display = 'block'; // Show config again
    speak("Workout Complete. Well done!");
    updateDisplay();
}


function startTimer() {
    errorMessage.textContent = ''; // Clear errors
    // Get values from inputs
    totalRounds = parseInt(roundsInput.value);
    exercisesPerRound = parseInt(exercisesPerRoundInput.value);
    exerciseTime = parseInt(exerciseTimeInput.value);
    restTime = parseInt(restTimeInput.value);
    roundRestTime = parseInt(roundRestTimeInput.value);

    // Basic Validation
    if (isNaN(totalRounds) || totalRounds < 1 ||
        isNaN(exercisesPerRound) || exercisesPerRound < 1 ||
        isNaN(exerciseTime) || exerciseTime < 1 ||
        isNaN(restTime) || restTime < 0 || // Allow 0 rest
        isNaN(roundRestTime) || roundRestTime < 0) // Allow 0 round rest
    {
        errorMessage.textContent = 'Please enter valid numbers (>= 1 for times/counts, >= 0 for rests).';
        speak('Invalid configuration.'); // Optional voice feedback for error
        return;
    }

     // Check if speech is available and maybe ask for permission implicitly
    if (synth && synth.getVoices().length === 0) {
       // Sometimes voices load asynchronously, try to speak something quiet first
       speak('');
       // A small delay might help if voices load slowly
       setTimeout(() => {
           if(synth.getVoices().length === 0) {
               console.warn("No voices available for speech synthesis.");
               // Optionally inform user, but don't block timer
           }
       }, 200);
    }


    currentRound = 1;
    currentExercise = 1;
    isPaused = false;

    configSection.style.display = 'none'; // Hide config
    timerDisplaySection.style.display = 'block'; // Show timer

    startPauseButton.textContent = 'Pause';
    startPauseButton.classList.add('pause');

    startPrepare(); // Start with a preparation phase
}

function pauseTimer() {
    isPaused = true;
    clearInterval(intervalId);
    startPauseButton.textContent = 'Resume';
    startPauseButton.classList.remove('pause');
    speak("Paused");
}

function resumeTimer() {
    if (state === 'idle' || state === 'finished') return; // Cannot resume if not started or finished

    isPaused = false;
    intervalId = setInterval(tick, 1000);
    startPauseButton.textContent = 'Pause';
    startPauseButton.classList.add('pause');
    speak("Resuming");
    // Re-announce current state and time remaining? Maybe not necessary.
}

function toggleStartPause() {
    if (state === 'idle' || state === 'finished') {
        startTimer();
    } else if (isPaused) {
        resumeTimer();
    } else {
        pauseTimer();
    }
}

function resetTimer() {
    clearInterval(intervalId);
    intervalId = null;
    isPaused = false;
    state = 'idle';
    currentRound = 1;
    currentExercise = 1;
    currentTime = 0;
    totalTimeForCurrentPhase = 0;
    synth.cancel(); // Stop any ongoing speech

    configSection.style.display = 'block'; // Show config
    timerDisplaySection.style.display = 'none'; // Hide timer
    startPauseButton.textContent = 'Start';
    startPauseButton.classList.remove('pause');
    errorMessage.textContent = ''; // Clear errors

    // Reset display elements explicitly
    currentStateDisplay.textContent = 'Configure & Start';
    timerDisplay.textContent = '--';
    roundInfoDisplay.textContent = 'Round: - / - | Exercise: - / -';
    progressBar.style.width = '0%';
     nextUpDisplay.textContent = '';
     timerDisplaySection.className = 'timer-section card'; // Reset background/border
}

// Event Listeners
startPauseButton.addEventListener('click', toggleStartPause);
resetButton.addEventListener('click', resetTimer);

// Initial setup
resetTimer(); // Set the initial state correctly on page load