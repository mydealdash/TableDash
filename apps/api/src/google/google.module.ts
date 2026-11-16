import { Module } from '@nestjs/common';
import { GooglePlacesService } from './google-places.service';
import { GoogleController } from './google.controller';
@Module({ providers: [GooglePlacesService], controllers: [GoogleController], exports: [GooglePlacesService] })
export class GoogleModule {}
