import './style.css';

import { AppController } from './app/controller';
import { mountApp } from './app/dom';

const appController = new AppController(mountApp(document));
appController.start();
