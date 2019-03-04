import {browser, Tensor3D} from '@tensorflow/tfjs-core';
import {assert} from '@tensorflow/tfjs-core/dist/util';
import {WebcamConfig} from '../types';
import {LazyIterator} from './lazy_iterator';


/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * =============================================================================
 */

export class WebcamIterator extends LazyIterator<Tensor3D> {
  private isStreamStarted: boolean;
  private isClosed = true;
  private stream: MediaStream;

  private constructor(
      protected readonly webcamVideoElement: HTMLVideoElement,
      protected readonly webcamConfig: WebcamConfig) {
    super();
  }

  summary() {
    return `Endless data stream from webcam`;
  }

  static async create(
      webcamVideoElement: HTMLVideoElement, webcamConfig: WebcamConfig = {}) {
    const webcamIterator = new WebcamIterator(webcamVideoElement, webcamConfig);
    await webcamIterator.start();
    return webcamIterator;
  }

  async start(): Promise<void> {
    if (this.webcamConfig.facingMode) {
      assert(
          (this.webcamConfig.facingMode === 'user') ||
              (this.webcamConfig.facingMode === 'environment'),
          () => 'Invalid wecam facing model: ' + this.webcamConfig.facingMode);
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: this.webcamConfig.deviceId,
          facingMode: this.webcamConfig.facingMode ?
              this.webcamConfig.facingMode :
              'user',
          width: this.webcamVideoElement.width,
          height: this.webcamVideoElement.height
        }
      });
    } catch (e) {
      // Modify the error message but leave the stack trace intact
      e.message = `Error thrown while initializing video stream: ${e.message}`;
      throw e;
    }

    if (!this.stream) {
      throw new Error('Could not obtain video from webcam.');
    }

    // Older browsers may not have srcObject
    try {
      this.webcamVideoElement.srcObject = this.stream;
    } catch (error) {
      console.log(error);
      this.webcamVideoElement.src = window.URL.createObjectURL(this.stream);
    }
    this.isClosed = false;

    return await new Promise<void>(resolve => {
      this.webcamVideoElement.addEventListener('loadeddata', () => {
        resolve();
      });
    });
  }

  async next(): Promise<IteratorResult<Tensor3D>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }
    const img = browser.fromPixels(this.webcamVideoElement);
    if (this.isStreamStarted) {
      return {value: img, done: false};
    } else {
      const maxValue = img.max().dataSync()[0];
      if (maxValue > 0) {
        this.isStreamStarted = true;
        return {value: img, done: false};
      } else {
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.next();
      }
    }
  }

  async capture(): Promise<Tensor3D> {
    return (await this.next()).value;
  }

  stop(): void {
    const tracks = this.stream.getTracks();

    tracks.forEach(function(track) {
      track.stop();
    });

    try {
      this.webcamVideoElement.srcObject = null;
    } catch (error) {
      console.log(error);
      this.webcamVideoElement.src = null;
    }
    this.isStreamStarted = false;
    this.isClosed = true;
  }
}
